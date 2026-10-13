import { findTransaction } from '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'

import * as coverage from '../../coverage/coverage'
import { contractCode } from '../../../wrappers/codeLoader'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as deposit from '../../../wrappers/gen/ccip/DepositAccount'
import * as dep from '../../../wrappers/libraries/Deployable'
import * as NameSpace from '../../../wrappers/ccip/NameSpace'
import { setup, contractsCoverageConfig } from './Router.Setup'

// Value covering Router_Costs.GetOnRampAccount() plus the account's init compute/storage and
// the reply round-trip (the Router carries all remaining value forward on each leg).
const getOnRampAccountValue = toNano('1')

describe('Router.getOnRampAccount', () => {
  let blockchain: Blockchain
  let sender: SandboxContract<TreasuryContract>
  let attacker: SandboxContract<TreasuryContract>
  let token: Address
  let otherToken: Address
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>
  let deployableCode: Cell

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity = {
      print: true,
      blockchainLogs: false,
      vmLogs: 'none',
      debugLogs: true,
    }
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    feeQuoter = await blockchain.treasury('feeQuoter')
    onRamp = await blockchain.treasury('onRamp')
    deployableCode = await contractCode.ccip.local('Deployable')
  })

  beforeEach(async () => {
    // We don't need the setup function to deploy feeQuoter and onRamp so we pass mock addresses for them.
    ;({ sender, router } = await setup(blockchain, { feeQuoter, onRamp }))
    attacker = await blockchain.treasury('attacker')
    token = (await blockchain.treasury('jettonMaster')).address
    otherToken = (await blockchain.treasury('otherJettonMaster')).address
  })

  // The Router's own derivation of the sender's onramp account (Deployable namespace
  // OnRampAccount, owner = Router, id = (user, token)). Must match Router.onRampAccountAddress.
  const expectedAccountAddress = (
    user: Address = sender.address,
    jetton: Address = token,
  ): Address =>
    NameSpace.deriveAddress(
      router.address,
      NameSpace.CCIPNamespace.OnRampAccount,
      beginCell().storeAddress(user).storeAddress(jetton),
      deployableCode,
    )

  // Requests the on-ramp account and, on its first init, answers the account's TEP-89 wallet
  // query on behalf of the token.
  const requestOnRampAccount = async (
    via: SandboxContract<TreasuryContract>,
    jetton: Address = token,
    value: bigint = getOnRampAccountValue,
  ) => {
    const request = await router.sendRouterGetOnRampAccount(via.getSender(), value, {
      token: jetton,
    })
    const account = expectedAccountAddress(via.address, jetton)
    if (
      !findTransaction(request.transactions, {
        from: account,
        to: jetton,
        op: deposit.RequestWalletAddress.PREFIX,
      })
    ) {
      return request
    }
    const answer = await blockchain
      .openContract(deposit.DepositAccount.fromAddress(account))
      .sendResponseWalletAddress(blockchain.sender(jetton), toNano('0.05'), {
        queryId: 0n,
        jettonWalletAddress: new Address(0, beginCell().storeAddress(account).endCell().hash()),
        ownerAddress: null,
      })
    return { ...answer, transactions: [...request.transactions, ...answer.transactions] }
  }

  // Router_OnRampAccountContext { user, token } echoed through DepositAccount_Init.forwardPayload.
  const ON_RAMP_ACCOUNT_CONTEXT_PREFIX = 0x9e339227
  const onRampAccountContext = (user: Address, jetton: Address): Cell =>
    beginCell()
      .storeUint(ON_RAMP_ACCOUNT_CONTEXT_PREFIX, 32)
      .storeAddress(user)
      .storeAddress(jetton)
      .endCell()

  it('exposes the derived account address via the onRampAccountAddress getter', async () => {
    const getterAddress = await router.getOnRampAccountAddress(sender.address, token)
    expect(getterAddress.equals(expectedAccountAddress())).toBe(true)
  })

  it('deploys and initializes the sender onramp account, then answers with UseOnRampAccount', async () => {
    const accountAddress = expectedAccountAddress()
    const result = await requestOnRampAccount(sender)

    // Router -> account (Deployable_Initialize installs the OnRampAccount code/data; the
    // address carries a state init, so this deploys the Deployable shell).
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: accountAddress,
      op: dep.opcodes.in.initialize,
      deploy: true,
      success: true,
    })

    // Router -> account (DepositAccount_Init sent directly by the Router, the account's owner).
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: accountAddress,
      op: deposit.DepositAccount_Init.PREFIX,
      success: true,
    })

    // Account -> Router (DepositAccount_Initialized echoes the (user, token) context as forward payload).
    expect(result.transactions).toHaveTransaction({
      from: accountAddress,
      to: router.address,
      op: deposit.DepositAccount_Initialized.PREFIX,
      success: true,
      body(body) {
        if (!body) return false
        const reply = deposit.DepositAccount_Initialized.fromSlice(body.beginParse())
        return reply.forwardPayload?.equals(onRampAccountContext(sender.address, token)) === true
      },
    })

    // Router -> user (Router_UseOnRampAccount carries the account address).
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_UseOnRampAccount.PREFIX,
      body(body) {
        if (!body) return false
        const use = rt.Router_UseOnRampAccount.fromSlice(body.beginParse())
        return use.account.equals(accountAddress) && use.token.equals(token)
      },
    })
  })

  it('initializes the account with the Router as owner, the user and the token bound', async () => {
    const result = await requestOnRampAccount(sender)
    expect(result.transactions).toHaveTransaction({
      to: sender.address,
      op: rt.Router_UseOnRampAccount.PREFIX,
      success: true,
    })

    const account = blockchain.openContract(
      deposit.DepositAccount.fromAddress(expectedAccountAddress()),
    )
    expect((await account.getOwner()).equals(router.address)).toBe(true)
    expect((await account.getUser()).equals(sender.address)).toBe(true)
    expect((await account.getToken()).equals(token)).toBe(true)
    expect(await account.getWallet()).not.toBeNull()
    const beneficiaries = await account.getBeneficiaries()
    expect(beneficiaries.size).toBe(2)
    const beneficiaryStrings = new Set(
      beneficiaries.keys().map((beneficiary) => beneficiary.toRawString()),
    )
    expect(beneficiaryStrings).toContain(router.address.toRawString())
    expect(beneficiaryStrings).toContain(sender.address.toRawString())
  })

  it('is idempotent: re-requesting the account for the same user succeeds', async () => {
    const first = await requestOnRampAccount(sender)
    expect(first.transactions).toHaveTransaction({
      to: sender.address,
      op: rt.Router_UseOnRampAccount.PREFIX,
      success: true,
    })

    // Second call: the retried Deployable_Initialize bounces off the already-upgraded account
    // (unrecognized opcode), but the init still succeeds and the reply round-trip repeats.
    const second = await requestOnRampAccount(sender)
    expect(second.transactions).toHaveTransaction({
      from: router.address,
      to: expectedAccountAddress(),
      op: dep.opcodes.in.initialize,
      success: false,
    })
    expect(second.transactions).toHaveTransaction({
      to: sender.address,
      op: rt.Router_UseOnRampAccount.PREFIX,
      success: true,
      body(body) {
        if (!body) return false
        const use = rt.Router_UseOnRampAccount.fromSlice(body.beginParse())
        return use.account.equals(expectedAccountAddress())
      },
    })
  })

  it('gives different users different onramp accounts', async () => {
    const other = attacker
    const forSender = await router.getOnRampAccountAddress(sender.address, token)
    const forOther = await router.getOnRampAccountAddress(other.address, token)
    expect(forSender.equals(forOther)).toBe(false)

    const result = await requestOnRampAccount(other)
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: other.address,
      op: rt.Router_UseOnRampAccount.PREFIX,
      body(body) {
        if (!body) return false
        const use = rt.Router_UseOnRampAccount.fromSlice(body.beginParse())
        return use.account.equals(forOther)
      },
    })
  })

  it('rejects a spoofed OnRampAccount_Reply that does not derive to the claimed user', async () => {
    // An attacker sends a DepositAccount_Initialized claiming to be the sender's account with the
    // sender's (user, token) context in the forward payload. The Router re-derives the expected
    // account address from the payload and rejects the message (SenderIsNotOnRampAccount).
    const spoofed = await router.sendDepositAccountInitialized(
      attacker.getSender(),
      toNano('0.5'),
      {
        forwardPayload: onRampAccountContext(sender.address, token),
      },
    )
    expect(spoofed.transactions).toHaveTransaction({
      from: attacker.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SenderIsNotOnRampAccount'],
    })

    // ...and the user never receives a UseOnRampAccount for it.
    expect(spoofed.transactions).not.toHaveTransaction({
      op: rt.Router_UseOnRampAccount.PREFIX,
    })
  })

  it('gives the same user a different onramp account per token', async () => {
    const forToken = await router.getOnRampAccountAddress(sender.address, token)
    const forOtherToken = await router.getOnRampAccountAddress(sender.address, otherToken)
    expect(forToken.equals(forOtherToken)).toBe(false)
    expect(forOtherToken.equals(expectedAccountAddress(sender.address, otherToken))).toBe(true)

    await requestOnRampAccount(sender)
    const result = await requestOnRampAccount(sender, otherToken)
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: forOtherToken,
      op: dep.opcodes.in.initialize,
      deploy: true,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_UseOnRampAccount.PREFIX,
      body(body) {
        if (!body) return false
        const use = rt.Router_UseOnRampAccount.fromSlice(body.beginParse())
        return use.account.equals(forOtherToken) && use.token.equals(otherToken)
      },
    })

    const first = blockchain.openContract(deposit.DepositAccount.fromAddress(forToken))
    const second = blockchain.openContract(deposit.DepositAccount.fromAddress(forOtherToken))
    expect((await first.getToken()).equals(token)).toBe(true)
    expect((await second.getToken()).equals(otherToken)).toBe(true)
  })

  it('rejects a reply from the account of a different token than the claimed one', async () => {
    await requestOnRampAccount(sender)

    // The genuine (sender, token) account replies claiming to be the (sender, otherToken) account.
    const result = await router.sendDepositAccountInitialized(
      blockchain.sender(expectedAccountAddress(sender.address, token)),
      toNano('0.5'),
      { forwardPayload: onRampAccountContext(sender.address, otherToken) },
    )
    expect(result.transactions).toHaveTransaction({
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SenderIsNotOnRampAccount'],
    })
    expect(result.transactions).not.toHaveTransaction({
      op: rt.Router_UseOnRampAccount.PREFIX,
    })
  })

  const expectOnRampAccountFailed = (
    result: Awaited<ReturnType<typeof router.sendRouterGetOnRampAccount>>,
    queryId: bigint,
    error: number,
  ) =>
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_OnRampAccountFailed.PREFIX,
      body(body) {
        if (!body) return false
        const failed = rt.Router_OnRampAccountFailed.fromSlice(body.beginParse())
        return failed.queryId === queryId && failed.error === BigInt(error)
      },
    })

  it('notifies the user when the token cannot report the account wallet', async () => {
    await router.sendRouterGetOnRampAccount(sender.getSender(), getOnRampAccountValue, {
      queryId: 3n,
      token,
    })
    const result = await blockchain
      .openContract(deposit.DepositAccount.fromAddress(expectedAccountAddress()))
      .sendResponseWalletAddress(blockchain.sender(token), toNano('0.05'), {
        queryId: 0n,
        jettonWalletAddress: null,
        ownerAddress: null,
      })
    expectOnRampAccountFailed(
      result,
      3n,
      rt.Router.Errors['Router_Error.DepositAccountWalletUnavailable'],
    )
    expect(result.transactions).not.toHaveTransaction({ op: rt.Router_UseOnRampAccount.PREFIX })
  })

  it('notifies the user when the account init bounces', async () => {
    // The first request waits for the token's wallet response, so a second one is refused.
    await router.sendRouterGetOnRampAccount(sender.getSender(), getOnRampAccountValue, {
      queryId: 1n,
      token,
    })
    const result = await router.sendRouterGetOnRampAccount(
      sender.getSender(),
      getOnRampAccountValue,
      { queryId: 2n, token },
    )
    expectOnRampAccountFailed(
      result,
      2n,
      deposit.DepositAccount.Errors['DepositAccount_Error.InitPending'],
    )
  })

  it('rejects a DepositAccount_WalletUnavailable for an onramp account not sent by that account', async () => {
    const result = await router.sendDepositAccountWalletUnavailable(
      attacker.getSender(),
      toNano('0.5'),
      {
        forwardPayload: onRampAccountContext(sender.address, token),
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: attacker.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SenderIsNotOnRampAccount'],
    })
    expect(result.transactions).not.toHaveTransaction({ from: router.address, to: sender.address })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_getOnRampAccount',
        await contractsCoverageConfig(),
      )
    }
  })
})

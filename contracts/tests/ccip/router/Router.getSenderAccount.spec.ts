import { findTransaction } from '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'

import * as coverage from '../../coverage/coverage'
import { contractCode } from '../../../wrappers/codeLoader'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as deposit from '../../../wrappers/gen/ccip/DepositAccount'
import * as dep from '../../../wrappers/libraries/Deployable'
import * as NameSpace from '../../../wrappers/ccip/NameSpace'
import { Costs } from '../../../wrappers/ccip/Router'
import { setup, contractsCoverageConfig } from './Router.Setup'

const getSenderAccountValue = Costs.getSenderAccount

describe('Router.getSenderAccount', () => {
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

  // The Router's own derivation of the sender's sender account (Deployable namespace
  // SenderAccount, owner = Router, id = (user, token)). Must match Router.senderAccountAddress.
  const expectedAccountAddress = (
    user: Address = sender.address,
    jetton: Address = token,
  ): Address =>
    NameSpace.deriveAddress(
      router.address,
      NameSpace.CCIPNamespace.SenderAccount,
      beginCell().storeAddress(user).storeAddress(jetton),
      deployableCode,
    )

  // Requests the sender account and, on its first init, answers the account's TEP-89 wallet
  // query on behalf of the token.
  const requestSenderAccount = async (
    via: SandboxContract<TreasuryContract>,
    jetton: Address = token,
    value: bigint = getSenderAccountValue,
    context: Cell | null = null,
  ) => {
    const request = await router.sendRouterGetSenderAccount(via.getSender(), value, {
      token: jetton,
      context,
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

  // Router_SenderAccountContext { user, token, userContext } echoed through DepositAccount_Init.context.
  const SENDER_ACCOUNT_CONTEXT_PREFIX = 0x4713c0b5
  const senderAccountContext = (
    user: Address,
    jetton: Address,
    userContext: Cell | null = null,
  ): Cell =>
    beginCell()
      .storeUint(SENDER_ACCOUNT_CONTEXT_PREFIX, 32)
      .storeAddress(user)
      .storeAddress(jetton)
      .storeMaybeRef(userContext)
      .endCell()

  const userContext = beginCell().storeUint(0xc0ffee, 32).endCell()

  it('exposes the derived account address via the senderAccountAddress getter', async () => {
    const getterAddress = await router.getSenderAccountAddress(sender.address, token)
    expect(getterAddress.equals(expectedAccountAddress())).toBe(true)
  })

  it('deploys and initializes the sender sender account, then answers with UseSenderAccount', async () => {
    const accountAddress = expectedAccountAddress()
    const result = await requestSenderAccount(sender)

    // Router -> account (Deployable_Initialize installs the SenderAccount code/data; the
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
        return reply.context?.equals(senderAccountContext(sender.address, token)) === true
      },
    })

    // Router -> user (Router_UseSenderAccount carries the account address).
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_UseSenderAccount.PREFIX,
      body(body) {
        if (!body) return false
        const use = rt.Router_UseSenderAccount.fromSlice(body.beginParse())
        return use.account.equals(accountAddress) && use.token.equals(token)
      },
    })
  })

  it('initializes the account with the Router as owner, the user and the token bound', async () => {
    const result = await requestSenderAccount(sender)
    expect(result.transactions).toHaveTransaction({
      to: sender.address,
      op: rt.Router_UseSenderAccount.PREFIX,
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
    const first = await requestSenderAccount(sender)
    expect(first.transactions).toHaveTransaction({
      to: sender.address,
      op: rt.Router_UseSenderAccount.PREFIX,
      success: true,
    })

    // Second call: the retried Deployable_Initialize bounces off the already-upgraded account
    // (unrecognized opcode), but the init still succeeds and the reply round-trip repeats.
    const second = await requestSenderAccount(sender)
    expect(second.transactions).toHaveTransaction({
      from: router.address,
      to: expectedAccountAddress(),
      op: dep.opcodes.in.initialize,
      success: false,
    })
    expect(second.transactions).toHaveTransaction({
      to: sender.address,
      op: rt.Router_UseSenderAccount.PREFIX,
      success: true,
      body(body) {
        if (!body) return false
        const use = rt.Router_UseSenderAccount.fromSlice(body.beginParse())
        return use.account.equals(expectedAccountAddress())
      },
    })
  })

  it('gives different users different sender accounts', async () => {
    const other = attacker
    const forSender = await router.getSenderAccountAddress(sender.address, token)
    const forOther = await router.getSenderAccountAddress(other.address, token)
    expect(forSender.equals(forOther)).toBe(false)

    const result = await requestSenderAccount(other)
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: other.address,
      op: rt.Router_UseSenderAccount.PREFIX,
      body(body) {
        if (!body) return false
        const use = rt.Router_UseSenderAccount.fromSlice(body.beginParse())
        return use.account.equals(forOther)
      },
    })
  })

  it('rejects a spoofed SenderAccount_Reply that does not derive to the claimed user', async () => {
    // An attacker sends a DepositAccount_Initialized claiming to be the sender's account with the
    // sender's (user, token) context in the forward payload. The Router re-derives the expected
    // account address from the payload and rejects the message (SenderIsNotSenderAccount).
    const spoofed = await router.sendDepositAccountInitialized(
      attacker.getSender(),
      toNano('0.5'),
      {
        context: senderAccountContext(sender.address, token),
      },
    )
    expect(spoofed.transactions).toHaveTransaction({
      from: attacker.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SenderIsNotSenderAccount'],
    })

    // ...and the user never receives a UseSenderAccount for it.
    expect(spoofed.transactions).not.toHaveTransaction({
      op: rt.Router_UseSenderAccount.PREFIX,
    })
  })

  it('gives the same user a different sender account per token', async () => {
    const forToken = await router.getSenderAccountAddress(sender.address, token)
    const forOtherToken = await router.getSenderAccountAddress(sender.address, otherToken)
    expect(forToken.equals(forOtherToken)).toBe(false)
    expect(forOtherToken.equals(expectedAccountAddress(sender.address, otherToken))).toBe(true)

    await requestSenderAccount(sender)
    const result = await requestSenderAccount(sender, otherToken)
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
      op: rt.Router_UseSenderAccount.PREFIX,
      body(body) {
        if (!body) return false
        const use = rt.Router_UseSenderAccount.fromSlice(body.beginParse())
        return use.account.equals(forOtherToken) && use.token.equals(otherToken)
      },
    })

    const first = blockchain.openContract(deposit.DepositAccount.fromAddress(forToken))
    const second = blockchain.openContract(deposit.DepositAccount.fromAddress(forOtherToken))
    expect((await first.getToken()).equals(token)).toBe(true)
    expect((await second.getToken()).equals(otherToken)).toBe(true)
  })

  it('rejects a reply from the account of a different token than the claimed one', async () => {
    await requestSenderAccount(sender)

    // The genuine (sender, token) account replies claiming to be the (sender, otherToken) account.
    const result = await router.sendDepositAccountInitialized(
      blockchain.sender(expectedAccountAddress(sender.address, token)),
      toNano('0.5'),
      { context: senderAccountContext(sender.address, otherToken) },
    )
    expect(result.transactions).toHaveTransaction({
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SenderIsNotSenderAccount'],
    })
    expect(result.transactions).not.toHaveTransaction({
      op: rt.Router_UseSenderAccount.PREFIX,
    })
  })

  const expectSenderAccountFailed = (
    result: Awaited<ReturnType<typeof router.sendRouterGetSenderAccount>>,
    queryId: bigint,
    error: number,
    context: Cell | null = null,
  ) =>
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_SenderAccountFailed.PREFIX,
      body(body) {
        if (!body) return false
        const failed = rt.Router_SenderAccountFailed.fromSlice(body.beginParse())
        return (
          failed.queryId === queryId &&
          failed.error === BigInt(error) &&
          (context === null ? failed.context === null : failed.context?.equals(context) === true)
        )
      },
    })

  it('echoes the request context back in Router_UseSenderAccount', async () => {
    const result = await requestSenderAccount(sender, token, getSenderAccountValue, userContext)
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_UseSenderAccount.PREFIX,
      body(body) {
        if (!body) return false
        const use = rt.Router_UseSenderAccount.fromSlice(body.beginParse())
        return use.context?.equals(userContext) === true
      },
    })
  })

  it('echoes the request context back in Router_SenderAccountFailed when the wallet is unavailable', async () => {
    await router.sendRouterGetSenderAccount(sender.getSender(), getSenderAccountValue, {
      queryId: 4n,
      token,
      context: userContext,
    })
    const result = await blockchain
      .openContract(deposit.DepositAccount.fromAddress(expectedAccountAddress()))
      .sendResponseWalletAddress(blockchain.sender(token), toNano('0.05'), {
        queryId: 0n,
        jettonWalletAddress: null,
        ownerAddress: null,
      })
    expectSenderAccountFailed(
      result,
      4n,
      rt.Router.Errors['Router_Error.DepositAccountWalletUnavailable'],
      userContext,
    )
  })

  it('echoes the request context back in Router_SenderAccountFailed when the init bounces', async () => {
    await router.sendRouterGetSenderAccount(sender.getSender(), getSenderAccountValue, {
      queryId: 5n,
      token,
    })
    const result = await router.sendRouterGetSenderAccount(
      sender.getSender(),
      getSenderAccountValue,
      { queryId: 6n, token, context: userContext },
    )
    expectSenderAccountFailed(
      result,
      6n,
      deposit.DepositAccount.Errors['DepositAccount_Error.InitPending'],
      userContext,
    )
  })

  it('rejects a request below Router_Costs.GetSenderAccount', async () => {
    const result = await router.sendRouterGetSenderAccount(
      sender.getSender(),
      Costs.getSenderAccount - 1n,
      { token },
    )
    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.InsufficientFee'],
    })
  })

  it('notifies the user when the token cannot report the account wallet', async () => {
    await router.sendRouterGetSenderAccount(sender.getSender(), getSenderAccountValue, {
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
    expectSenderAccountFailed(
      result,
      3n,
      rt.Router.Errors['Router_Error.DepositAccountWalletUnavailable'],
    )
    expect(result.transactions).not.toHaveTransaction({ op: rt.Router_UseSenderAccount.PREFIX })
  })

  it('notifies the user when the account init bounces', async () => {
    // The first request waits for the token's wallet response, so a second one is refused.
    await router.sendRouterGetSenderAccount(sender.getSender(), getSenderAccountValue, {
      queryId: 1n,
      token,
    })
    const result = await router.sendRouterGetSenderAccount(
      sender.getSender(),
      getSenderAccountValue,
      { queryId: 2n, token },
    )
    expectSenderAccountFailed(
      result,
      2n,
      deposit.DepositAccount.Errors['DepositAccount_Error.InitPending'],
    )
  })

  it('rejects a DepositAccount_WalletUnavailable for an sender account not sent by that account', async () => {
    const result = await router.sendDepositAccountWalletUnavailable(
      attacker.getSender(),
      toNano('0.5'),
      {
        context: senderAccountContext(sender.address, token),
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: attacker.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SenderIsNotSenderAccount'],
    })
    expect(result.transactions).not.toHaveTransaction({ from: router.address, to: sender.address })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_getSenderAccount',
        await contractsCoverageConfig(),
      )
    }
  })
})

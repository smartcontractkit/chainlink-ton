import '@ton/test-utils'
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
  })

  // The Router's own derivation of the sender's onramp account (Deployable namespace 4,
  // owner = Router, id = user address). Must match Router.onRampAccountAddress.
  const expectedAccountAddress = (): Address =>
    NameSpace.deriveAddress(
      router.address,
      NameSpace.CCIPNamespace.OnRampAccount,
      beginCell().storeAddress(sender.address),
      deployableCode,
    )

  it('exposes the derived account address via the onRampAccountAddress getter', async () => {
    const getterAddress = await router.getOnRampAccountAddress(sender.address)
    expect(getterAddress.equals(expectedAccountAddress())).toBe(true)
  })

  it('deploys and initializes the sender onramp account, then answers with UseOnRampAccount', async () => {
    const accountAddress = expectedAccountAddress()
    const result = await router.sendRouterGetOnRampAccount(
      sender.getSender(),
      getOnRampAccountValue,
      {},
    )

    // Router -> account (Deployable_InitializeAndSend installs the OnRampAccount code/data; the
    // address carries a state init, so this deploys the Deployable shell).
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: accountAddress,
      op: dep.opcodes.in.initializeAndSend,
      deploy: true,
      success: true,
    })

    // account -> account (DepositAccount_Init; sends init to itself to continue execution).
    expect(result.transactions).toHaveTransaction({
      from: accountAddress,
      to: accountAddress,
      op: deposit.DepositAccount_Init.PREFIX,
      success: true,
    })

    // Account -> Router (DepositAccount_Reply echoes the user's address as forward payload).
    expect(result.transactions).toHaveTransaction({
      from: accountAddress,
      to: router.address,
      op: deposit.DepositAccount_Reply.PREFIX,
      success: true,
      body(body) {
        if (!body) return false
        const reply = deposit.DepositAccount_Reply.fromSlice(body.beginParse())
        const payload = reply.forwardPayload
        if (!payload) return false
        return payload.beginParse().loadAddress().equals(sender.address)
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
        return use.account.equals(accountAddress)
      },
    })
  })

  it('initializes the account with the Router as owner/proxy and the user as beneficiary', async () => {
    const result = await router.sendRouterGetOnRampAccount(
      sender.getSender(),
      getOnRampAccountValue,
      {},
    )
    expect(result.transactions).toHaveTransaction({
      to: sender.address,
      op: rt.Router_UseOnRampAccount.PREFIX,
      success: true,
    })

    const account = blockchain.openContract(
      deposit.DepositAccount.fromAddress(expectedAccountAddress()),
    )
    expect((await account.getOwner()).equals(router.address)).toBe(true)
    expect((await account.getProxy()).equals(sender.address)).toBe(true)
    const beneficiaries = await account.getBeneficiaries()
    expect(beneficiaries.size).toBe(2)
    const beneficiaryStrings = new Set(
      beneficiaries.keys().map((beneficiary) => beneficiary.toRawString()),
    )
    expect(beneficiaryStrings).toContain(router.address.toRawString())
    expect(beneficiaryStrings).toContain(sender.address.toRawString())
  })

  it('is idempotent: re-requesting the account for the same user succeeds', async () => {
    const first = await router.sendRouterGetOnRampAccount(
      sender.getSender(),
      getOnRampAccountValue,
      {},
    )
    expect(first.transactions).toHaveTransaction({
      to: sender.address,
      op: rt.Router_UseOnRampAccount.PREFIX,
      success: true,
    })

    // Second call: the Deployable shell is already deployed and owned by the Router, so the
    // re-initialize is accepted and the reply round-trip repeats.
    const second = await router.sendRouterGetOnRampAccount(
      sender.getSender(),
      getOnRampAccountValue,
      {},
    )
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
    const forSender = await router.getOnRampAccountAddress(sender.address)
    const forOther = await router.getOnRampAccountAddress(other.address)
    expect(forSender.equals(forOther)).toBe(false)

    const result = await router.sendRouterGetOnRampAccount(
      other.getSender(),
      getOnRampAccountValue,
      {},
    )
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
    // An attacker sends a OnRampAccount_Reply claiming to be the sender's account with the
    // sender's address in the forward payload. The Router re-derives the expected account
    // address from the payload and rejects the message (SenderIsNotOnRampAccount).
    const spoofed = await router.sendDepositAccountReply(attacker.getSender(), toNano('0.5'), {
      forwardPayload: beginCell().storeAddress(sender.address).endCell(),
    })
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

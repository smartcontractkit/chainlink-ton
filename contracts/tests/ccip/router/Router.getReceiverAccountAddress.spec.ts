import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'

import * as coverage from '../../coverage/coverage'
import * as rt from '../../../wrappers/gen/ccip/Router'
import { setup, contractsCoverageConfig } from './Router.Setup'

describe('Router.getReceiverAccountAddress', () => {
  let blockchain: Blockchain
  let sender: SandboxContract<TreasuryContract>
  let token: Address
  let otherToken: Address
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>

  const value = toNano('0.05')

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    feeQuoter = await blockchain.treasury('feeQuoter')
    onRamp = await blockchain.treasury('onRamp')
  })

  beforeEach(async () => {
    ;({ sender, router } = await setup(blockchain, { feeQuoter, onRamp }))
    token = (await blockchain.treasury('jettonMaster')).address
    otherToken = (await blockchain.treasury('otherJettonMaster')).address
  })

  const request = (jetton: Address, queryId: bigint, context: Cell | null = null) =>
    router.sendRouterGetReceiverAccountAddress(sender.getSender(), value, {
      queryId,
      token: jetton,
      context,
    })

  const expectReply = (
    result: Awaited<ReturnType<typeof request>>,
    expected: { queryId: bigint; account: Address; token: Address; context: Cell | null },
  ) =>
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_ReceiverAccountAddress.PREFIX,
      success: true,
      body(body) {
        if (!body) return false
        const reply = rt.Router_ReceiverAccountAddress.fromSlice(body.beginParse())
        return (
          reply.queryId === expected.queryId &&
          reply.account.equals(expected.account) &&
          reply.token.equals(expected.token) &&
          (expected.context === null
            ? reply.context === null
            : reply.context?.equals(expected.context) === true)
        )
      },
    })

  it('answers with the receiver account address from the receiverAccountAddress getter', async () => {
    const account = await router.getReceiverAccountAddress(sender.address, token)
    const result = await request(token, 7n)
    expectReply(result, { queryId: 7n, account, token, context: null })
  })

  it('echoes the request context back', async () => {
    const context = beginCell().storeUint(0xc0ffee, 32).endCell()
    const account = await router.getReceiverAccountAddress(sender.address, token)
    const result = await request(token, 8n, context)
    expectReply(result, { queryId: 8n, account, token, context })
  })

  it('answers with a different account per token', async () => {
    const account = await router.getReceiverAccountAddress(sender.address, token)
    const otherAccount = await router.getReceiverAccountAddress(sender.address, otherToken)
    expect(otherAccount.equals(account)).toBe(false)

    const result = await request(otherToken, 9n)
    expectReply(result, { queryId: 9n, account: otherAccount, token: otherToken, context: null })
  })

  it('does not deploy anything and only replies to the caller', async () => {
    const account = await router.getReceiverAccountAddress(sender.address, token)
    const result = await request(token, 10n)

    // Router -> sender reply is the only outbound message.
    expect(result.transactions).not.toHaveTransaction({ from: router.address, to: account })
    expect(
      result.transactions.filter(
        (tx) => tx.inMessage?.info.src?.toString() === router.address.toString(),
      ),
    ).toHaveLength(1)
    const state = (await blockchain.getContract(account)).accountState
    expect(state?.type ?? 'uninit').not.toBe('active')
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_getReceiverAccountAddress',
        await contractsCoverageConfig(),
      )
    }
  })
})

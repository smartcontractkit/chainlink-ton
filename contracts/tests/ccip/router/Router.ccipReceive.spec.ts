import { toNano, Cell, beginCell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as rt from '../../../wrappers/gen/ccip/Router'
import * as rec from '../../../wrappers/gen/ccip/Receiver'
import { Costs as OffRampCosts } from '../../../wrappers/ccip/OffRamp'
import { setup, contractsCoverageConfig, genexecId } from './Router.Setup'
import EVM_ADDRESS from '../../utils/evmAddress'
import { ChainSelectors } from '../../utils/Selectors'

describe('Router', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>
  let offRamp: SandboxContract<TreasuryContract>
  let receiver: SandboxContract<TreasuryContract>

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
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    feeQuoter = await blockchain.treasury('feeQuoter')
    onRamp = await blockchain.treasury('onRamp')
    offRamp = await blockchain.treasury('offRamp')
  })

  beforeEach(async () => {
    ;({ deployer, receiver, router } = await setup(blockchain, {
      feeQuoter,
      onRamp,
      offRamp,
    }))
  })

  const any2tvmMessage = {
    $: 'Any2TVMMessage' as const,
    messageId: 42n,
    sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    sender: EVM_ADDRESS,
    data: beginCell().storeUint(0x1234, 32).endCell(),
    tokenAmounts: null,
  }

  it('should route message from OffRamp to receiver', async () => {
    const result = await router.sendRouterRouteMessage(offRamp.getSender(), toNano('1'), {
      message: any2tvmMessage,
      execId: genexecId({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        messageID: 1n,
      }),
      receiver: receiver.address,
      gasLimit: toNano('0.5'),
    })

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
      value: toNano('0.5'),
      op: rec.Receiver_CCIPReceiveV2.PREFIX,
    })

    const routed = result.transactions.find(
      (tx) => tx.inMessage?.info.src?.toString() === router.address.toString(),
    )
    const { confirmValue, receiverAccounts } = rec.Receiver_CCIPReceiveV2.fromSlice(
      routed!.inMessage!.body.beginParse(),
    )
    expect(confirmValue).toBeGreaterThanOrEqual(OffRampCosts.receiveConfirm)
    // No tokens, no receiver accounts.
    expect(receiverAccounts).toHaveLength(0)
  })

  it('should tell the receiver which receiver account the tokens were delivered to', async () => {
    const token = (await blockchain.treasury('jettonMaster')).address
    const result = await router.sendRouterRouteMessage(offRamp.getSender(), toNano('1'), {
      message: {
        ...any2tvmMessage,
        tokenAmounts: [rt.TokenAmount.create({ amount: 1000n, token })],
      },
      execId: genexecId({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        messageID: 5n,
      }),
      receiver: receiver.address,
      gasLimit: toNano('0.5'),
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
      op: rec.Receiver_CCIPReceiveV2.PREFIX,
    })

    const routed = result.transactions.find(
      (tx) => tx.inMessage?.info.src?.toString() === router.address.toString(),
    )
    const { receiverAccounts } = rec.Receiver_CCIPReceiveV2.fromSlice(
      routed!.inMessage!.body.beginParse(),
    )
    // Index-aligned with message.tokenAmounts.
    const expected = await router.getReceiverAccountAddress(receiver.address, token)
    expect(receiverAccounts).toHaveLength(1)
    expect(receiverAccounts[0].equals(expected)).toBe(true)
  })

  it('should throw on routeMessage if source chain is not enabled', async () => {
    const result = await router.sendRouterRouteMessage(offRamp.getSender(), toNano('1'), {
      message: {
        ...any2tvmMessage,
        sourceChainSelector: any2tvmMessage.sourceChainSelector + 1n,
      },
      execId: genexecId({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        messageID: 2n,
      }),
      receiver: receiver.address,
      gasLimit: toNano('0.5'),
    })

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SourceChainNotEnabled'],
    })
  })

  it('should throw on routeMessage from non OffRamp', async () => {
    const result = await router.sendRouterRouteMessage(deployer.getSender(), toNano('1'), {
      message: any2tvmMessage,
      execId: genexecId({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        messageID: 3n,
      }),
      receiver: receiver.address,
      gasLimit: toNano('0.5'),
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SenderIsNotOffRamp'],
    })
  })

  it('should reject routeMessage while the source chain is cursed', async () => {
    await router.sendRouterRMNRemoteCurse(deployer.getSender(), toNano('1'), {
      queryId: 4n,
      subjects: [any2tvmMessage.sourceChainSelector],
    })

    const result = await router.sendRouterRouteMessage(offRamp.getSender(), toNano('1'), {
      message: any2tvmMessage,
      execId: genexecId({
        sourceChainSelector: any2tvmMessage.sourceChainSelector,
        messageID: 4n,
      }),
      receiver: receiver.address,
      gasLimit: toNano('0.5'),
    })

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SubjectCursed'],
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_ccipReceive',
        await contractsCoverageConfig(),
      )
    }
  })
})

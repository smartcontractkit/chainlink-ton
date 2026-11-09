import { toNano, beginCell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as rt from '../../../wrappers/gen/ccip/Router'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import { setup, contractsCoverageConfig, genExecID } from './Router.Setup'
import { ChainSelectors } from '../../utils/Selectors'

describe('Router', () => {
  let blockchain: Blockchain
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
    ;({ receiver, router } = await setup(blockchain, {
      feeQuoter,
      onRamp,
      offRamp,
    }))
  })

  it('should handle ccipReceiveConfirm', async () => {
    const execID = genExecID({
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      messageID: 1n,
    })
    const result = await router.sendRouterCCIPReceiveConfirm(receiver.getSender(), toNano('1'), {
      execId: execID,
    })

    expect(result.transactions).toHaveTransaction({
      from: receiver.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: offRamp.address,
      success: true,
      op: of.OffRamp_CCIPReceiveConfirm.PREFIX,
      body(x) {
        if (!x) return false
        const decoded = of.OffRamp_CCIPReceiveConfirm.fromSlice(x.beginParse())
        return decoded.execId === execID
      },
    })
  })

  it('should throw on ccipReceiveConfirm with execID with invalid source chain', async () => {
    const execID = genExecID({
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001 + 1n,
      messageID: 1n,
    })
    const result = await router.sendRouterCCIPReceiveConfirm(receiver.getSender(), toNano('1'), {
      execId: execID,
    })

    expect(result.transactions).toHaveTransaction({
      from: receiver.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SourceChainNotEnabled'],
    })
  })

  it('should relay a rejected confirmation to its sender with the value', async () => {
    const result = await router.sendRouterCCIPReceiveConfirmRejectedByExecutor(
      offRamp.getSender(),
      toNano('0.05'),
      {
        queryId: 7n,
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        receiver: receiver.address,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      op: rt.Router_CCIPReceiveConfirmRejected.PREFIX,
      inMessageBounceable: false,
      value: (v) => v !== undefined && v > 0n,
      body(x) {
        if (!x) return false
        return rt.Router_CCIPReceiveConfirmRejected.fromSlice(x.beginParse()).queryId === 7n
      },
    })
  })

  it('should reject a confirmation rejection that does not come from the OffRamp', async () => {
    const result = await router.sendRouterCCIPReceiveConfirmRejectedByExecutor(
      receiver.getSender(),
      toNano('0.05'),
      {
        queryId: 7n,
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        receiver: receiver.address,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: receiver.address,
      to: router.address,
      success: false,
      exitCode: rt.Router.Errors['Router_Error.SenderIsNotOffRamp'],
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_ccipReceiveConfirm',
        await contractsCoverageConfig(),
      )
    }
  })
})

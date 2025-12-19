import { toNano, beginCell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as rt from '../../../wrappers/ccip/Router'
import * as of from '../../../wrappers/ccip/OffRamp'
import {
  setup,
  CHAINSEL_EVM_TEST_90000001,
  contractsCoverageConfig,
  genExecID,
} from './Router.Setup'

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
    const execID = genExecID({ sourceChainSelector: CHAINSEL_EVM_TEST_90000001, messageID: 1n })
    const result = await router.sendCCIPReceiveConfirm(receiver.getSender(), {
      value: toNano('1'),
      body: {
        execID,
      },
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
      op: of.Opcodes.ccipReceiveConfirm,
      body(x) {
        if (!x) return false
        const decoded = of.builder.messages.in.ccipReceiveConfirm.load(x.beginParse())
        return decoded.execID === execID
      },
    })
  })

  it('should throw on ccipReceiveConfirm with execID with invalid source chain', async () => {
    const execID = genExecID({
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001 + 1n,
      messageID: 1n,
    })
    const result = await router.sendCCIPReceiveConfirm(receiver.getSender(), {
      value: toNano('1'),
      body: {
        execID,
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: receiver.address,
      to: router.address,
      success: false,
      exitCode: rt.RouterError.SourceChainNotEnabled,
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

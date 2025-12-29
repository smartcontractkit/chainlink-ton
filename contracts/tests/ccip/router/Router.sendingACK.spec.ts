import { toNano, Cell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as rt from '../../../wrappers/ccip/Router'
import * as or from '../../../wrappers/ccip/OnRamp'
import { setup, CHAINSEL_EVM_TEST_90000001, contractsCoverageConfig } from './Router.Setup'

describe('Router', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<TreasuryContract>
  let onRamp: SandboxContract<TreasuryContract>

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
  })

  beforeEach(async () => {
    ;({ deployer, sender, router } = await setup(blockchain, { feeQuoter, onRamp }))
  })

  it('should forward message sent from onRamp', async () => {
    const result = await router.sendMessageSent(onRamp.getSender(), {
      value: toNano('1'),
      body: {
        queryID: 0n,
        messageId: 42n,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        sender: sender.address,
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      success: true,
      op: rt.opcodes.out.ccipSendACK,
      body(x) {
        if (!x) return false
        const decoded = rt.builder.message.out.ccipSendACK.load(x.beginParse())
        return decoded.queryID === 0n && decoded.messageId === 42n
      },
    })
  })

  it('should not forward message sent from non onRamp', async () => {
    const result = await router.sendMessageSent(deployer.getSender(), {
      value: toNano('1'),
      body: {
        queryID: 0n,
        messageId: 42n,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        sender: sender.address,
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      success: false,
      exitCode: rt.RouterError.NotOnRamp,
    })
  })

  it('should forward message rejected from onRamp', async () => {
    const result = await router.sendMessageRejected(onRamp.getSender(), {
      value: toNano('1'),
      body: {
        queryID: 0n,
        error: 42n,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        sender: sender.address,
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      success: true,
      op: rt.opcodes.out.ccipSendNACK,
      body(x) {
        if (!x) return false
        const decoded = rt.builder.message.out.ccipSendNACK.load(x.beginParse())
        return decoded.queryID === 0n && decoded.error === 42n
      },
    })
  })

  it('should not forward message rejected from non onRamp', async () => {
    const result = await router.sendMessageRejected(deployer.getSender(), {
      value: toNano('1'),
      body: {
        queryID: 0n,
        error: 42n,
        destChainSelector: CHAINSEL_EVM_TEST_90000001,
        sender: sender.address,
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: router.address,
      success: false,
      exitCode: rt.RouterError.NotOnRamp,
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_sendingACK',
        await contractsCoverageConfig(),
      )
    }
  })
})

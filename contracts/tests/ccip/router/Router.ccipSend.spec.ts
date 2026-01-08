import { toNano, Cell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as rt from '../../../wrappers/ccip/Router'
import * as or from '../../../wrappers/ccip/OnRamp'
import {
  setup,
  CHAINSEL_EVM_TEST_90000001,
  EVM_ADDRESS,
  TEST_TOKEN_ADDR,
  contractsCoverageConfig,
} from './Router.Setup'
import { ZERO_ADDRESS } from '../../../src/utils'

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

  const msg = {
    queryID: 1,
    destChainSelector: CHAINSEL_EVM_TEST_90000001,
    receiver: EVM_ADDRESS,
    data: Cell.EMPTY,
    tokenAmounts: [],
    feeToken: TEST_TOKEN_ADDR,
    extraArgs: rt.builder.data.extraArgs
      .encode({
        kind: 'generic-v2',
        gasLimit: 100n,
        allowOutOfOrderExecution: true,
      })
      .asCell(),
  }

  it('should accept message for enabled dest chain', async () => {
    const result = await router.sendCcipSend(sender.getSender(), {
      value: toNano('1'),
      body: msg,
    })

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: onRamp.address,
      success: true,
      op: or.opcodes.in.onrampSend,
    })
  })

  it('should reject message for disabled dest chain (never added)', async () => {
    const badMsg = { ...msg, destChainSelector: msg.destChainSelector + 1n }
    const result = await router.sendCcipSend(sender.getSender(), {
      value: toNano('1'),
      body: badMsg,
    })

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.opcodes.out.ccipSendNACK,
      body(x) {
        if (!x) return false
        const decoded = rt.builder.message.out.ccipSendNACK.load(x.beginParse())
        return decoded.error === BigInt(rt.RouterError.DestChainNotEnabled)
      },
    })
  })

  it('should reject message for disabled dest chain (removed)', async () => {
    // Disable the onRamp for the chain
    {
      const result = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
        value: toNano('1'),
        data: {
          queryID: 1n,
          onRamps: {
            destChainSelectors: [CHAINSEL_EVM_TEST_90000001],
            onRamp: undefined,
          },
        },
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })
    }

    const result = await router.sendCcipSend(sender.getSender(), {
      value: toNano('1'),
      body: msg,
    })

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.opcodes.out.ccipSendNACK,
      body(x) {
        if (!x) return false
        const decoded = rt.builder.message.out.ccipSendNACK.load(x.beginParse())
        return decoded.error === BigInt(rt.RouterError.DestChainNotEnabled)
      },
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_ccipSend',
        await contractsCoverageConfig(),
      )
    }
  })
})

import { toNano, Cell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as coverage from '../../coverage/coverage'

import * as rt from '../../../wrappers/gen/ccip/Router'
import * as or from '../../../wrappers/gen/ccip/OnRamp'
import { setup, contractsCoverageConfig } from './Router.Setup'
import EVM_ADDRESS from '../../utils/evmAddress'
import { ChainSelectors } from '../../utils/Selectors'
import { ccipSendCost } from '../../../wrappers/ccip/Router'
import { NATIVE_GRAM } from '../../../src/utils'
import { FeeQuoterSetup } from '../feequoter/FeeQuoterSetup'

describe('Router.ccipSend', () => {
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

  const msg = rt.Router_CCIPSend.create({
    queryID: 1n,
    destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    receiver: EVM_ADDRESS,
    data: Cell.EMPTY,
    tokenAmounts: [],
    feeToken: null, // defaults to NATIVE_GRAM
    extraArgs: rt.GenericExtraArgsV2.create({ gasLimit: 100n, allowOutOfOrderExecution: true }),
  })

  it('should accept message for enabled dest chain', async () => {
    const result = await router.sendRouterCCIPSend(sender.getSender(), ccipSendCost, msg)

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: onRamp.address,
      success: true,
      op: or.OnRamp_Send.PREFIX,
    })
  })

  it('should default a null feeToken to NATIVE_GRAM when forwarding to the OnRamp', async () => {
    const result = await router.sendRouterCCIPSend(sender.getSender(), ccipSendCost, msg)

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: onRamp.address,
      success: true,
      op: or.OnRamp_Send.PREFIX,
      body(x) {
        if (!x) return false
        const decoded = or.OnRamp_Send.fromSlice(x.beginParse())
        return decoded.msg.feeToken != null && decoded.msg.feeToken.equals(NATIVE_GRAM)
      },
    })
  })

  it('should reject message paying fees with a non-native token', async () => {
    const jettonMsg = {
      ...msg,
      feeToken: FeeQuoterSetup.CUSTOM_TOKEN.token,
    }
    const result = await router.sendRouterCCIPSend(sender.getSender(), ccipSendCost, jettonMsg)

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_CCIPSendNACK.PREFIX,
      body(x) {
        if (!x) return false
        const decoded = rt.Router_CCIPSendNACK.fromSlice(x.beginParse())
        return (
          decoded.error ===
          BigInt(rt.Router.Errors['Router_Error.FeePaymentsWithJettonsNotSupported'])
        )
      },
    })

    // The message must be rejected before reaching the OnRamp.
    expect(result.transactions).not.toHaveTransaction({
      from: router.address,
      to: onRamp.address,
      op: or.OnRamp_Send.PREFIX,
    })
  })

  it('should reject message for disabled dest chain (never added)', async () => {
    const badMsg = { ...msg, destChainSelector: msg.destChainSelector + 1n }
    const result = await router.sendRouterCCIPSend(sender.getSender(), ccipSendCost, badMsg)

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_CCIPSendNACK.PREFIX,
      body(x) {
        if (!x) return false
        const decoded = rt.Router_CCIPSendNACK.fromSlice(x.beginParse())
        return decoded.error === BigInt(rt.Router.Errors['Router_Error.DestChainNotEnabled'])
      },
    })
  })

  it('should reject message for disabled dest chain (removed)', async () => {
    // Disable the onRamp for the chain
    {
      const result = await router.sendRouterApplyRampUpdates(deployer.getSender(), toNano('1'), {
        queryId: 1n,
        onRampUpdates: rt.OnRamps.create({
          destChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
          onRamp: null,
        }),
      })
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })
    }

    const result = await router.sendRouterCCIPSend(sender.getSender(), ccipSendCost, msg)

    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_CCIPSendNACK.PREFIX,
      body(x) {
        if (!x) return false
        const decoded = rt.Router_CCIPSendNACK.fromSlice(x.beginParse())
        return decoded.error === BigInt(rt.Router.Errors['Router_Error.DestChainNotEnabled'])
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

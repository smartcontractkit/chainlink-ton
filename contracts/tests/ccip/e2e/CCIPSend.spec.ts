import { toNano, Cell, Address, beginCell } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { crc32 } from 'zlib'

import { LogTypes } from '../../../wrappers/ccip/Logs'
import { assertLog, getExternals } from '../../Logs'
import * as coverage from '../../coverage/coverage'
import {
  verifyBodyIsRouterMessageSent,
  verifyBodyIsRouterCCIPSendACK,
} from '../../utils/verifyMessageBody'
import { NATIVE_GRAM } from '../../../src/utils'

import { getValidatedFee } from '../../../src/ccipSend/fee'
import * as fq from '../../../wrappers/gen/ccip/FeeQuoter'
import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as rt from '../../../wrappers/gen/ccip/Router'
import { sendGetValidatedFee } from '../onramp/OnChainGetValidatedFee'
import { setup, contractsCoverageConfig } from '../router/Router.Setup'
import EVM_ADDRESS from '../../utils/evmAddress'
import { ChainSelectors } from '../../utils/Selectors'
import { ccipSendCost } from '../../../wrappers/ccip/Router'

describe('Router', () => {
  let blockchain: Blockchain
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<fq.FeeQuoter>
  let onRamp: SandboxContract<or.OnRamp>

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.now = 1
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
  })

  beforeEach(async () => {
    ;({ sender, router, feeQuoter, onRamp } = await setup(blockchain))
  })

  it('onramp arbitrary message passing', async () => {
    // Track initial balance to verify fees are handled correctly
    const initialOnRampBalance = (await blockchain.getContract(onRamp.address)).balance
    const ccipSend = rt.Router_CCIPSend.create({
      queryID: 1n,
      destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      receiver: EVM_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts: [],
      feeToken: NATIVE_GRAM,
      extraArgs: rt.GenericExtraArgsV2.create({ gasLimit: 100n, allowOutOfOrderExecution: true }),
    })

    const offchainFee = await getValidatedFee(blockchain, router.address, ccipSend)
    const onchainFee = await sendGetValidatedFee(sender.getSender(), router, ccipSend)
    expect(onchainFee).toBe(offchainFee)

    const totalSendValue = offchainFee + ccipSendCost
    {
      const onrampBalanceBefore = (await blockchain.getContract(onRamp.address)).balance
      const result = await router.sendRouterCCIPSend(sender.getSender(), totalSendValue, ccipSend)
      // we called the router
      expect(result.transactions).toHaveTransaction({
        from: sender.address,
        to: router.address,
        deploy: false,
        success: true,
      })
      // the router called the onRamp
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: onRamp.address,
        deploy: false,
        success: true,
      })

      const executorAddress = ((): Address => {
        for (const tx of result.transactions) {
          if (
            tx.inMessage != null &&
            tx.inMessage != undefined &&
            tx.inMessage.info.src != null &&
            tx.inMessage.info.src != undefined &&
            tx.inMessage.info.src instanceof Address &&
            tx.inMessage.info.src.equals(onRamp.address) &&
            tx.inMessage.info.dest != null &&
            tx.inMessage.info.dest != undefined &&
            tx.inMessage.info.dest instanceof Address
          ) {
            return tx.inMessage.info.dest
          }
        }
        throw new Error('Executor address not found')
      })()

      // the onRamp deployed the executor
      expect(result.transactions).toHaveTransaction({
        from: onRamp.address,
        to: executorAddress,
        deploy: true,
        success: true,
      })

      // assert message went to feeQuoter
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: feeQuoter.address,
        deploy: false,
        success: true,
      })

      // destChainConfig -> feeQuoter -> executor
      expect(result.transactions).toHaveTransaction({
        from: feeQuoter.address,
        to: executorAddress,
        deploy: false,
        success: true,
        destroyed: false,
      })

      // the executor called back the onRamp and self-destructed
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: onRamp.address,
        deploy: false,
        success: true,
      })

      // The executor locked the validated fee on the OnRamp (OnRamp_ExecutorReserveFee)
      // before finalizing: the OnRamp's balance grew by exactly the fee.
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: onRamp.address,
        op: or.OnRamp_ExecutorReserveFee.PREFIX,
        success: true,
      })
      const onrampBalanceAfter = (await blockchain.getContract(onRamp.address)).balance
      expect(onrampBalanceAfter).toBe(onrampBalanceBefore + offchainFee)

      // assert CCIPMessageSent
      assertLog(result.transactions, onRamp.address, LogTypes.CCIPMessageSent, {
        message: {
          header: {
            destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          },
          sender: sender.address,
        },
      })

      // The OnRamp sent Router_MessageSent message to the Router
      expect(result.transactions).toHaveTransaction({
        from: onRamp.address,
        to: router.address,
        deploy: false,
        success: true,
        op: rt.Router_MessageSent.PREFIX,
        body(x) {
          return verifyBodyIsRouterMessageSent(x, {
            validation: (messageSent) => {
              return (
                messageSent.destChainSelector == ccipSend.destChainSelector &&
                messageSent.sender.equals(sender.address)
              )
            },
          })
        },
      })

      // Router sent Router_CCIPSendACK message to the sender
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: sender.address,
        deploy: false,
        success: true,
        op: rt.Router_CCIPSendACK.PREFIX,
        body(x) {
          return verifyBodyIsRouterCCIPSendACK(x, {
            validation: (ccipSendACK) => {
              return ccipSendACK.queryID == ccipSend.queryID && ccipSendACK.messageId != 0n
            },
          })
        },
      })
    }
  })

  it('should apply default extra args when CCIPSend is sent with empty extra args', async () => {
    // When the user sends a CCIPSend with empty extra args, the FeeQuoter should
    // parse them and apply the default gas limit from the dest chain config.
    // The OnRamp should then emit a CCIPMessageSent event with the validated extra args.
    const ccipSendWithEmptyExtraArgs = rt.Router_CCIPSend.create({
      queryID: 2n,
      destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      receiver: EVM_ADDRESS,
      data: Cell.EMPTY,
      tokenAmounts: [],
      feeToken: NATIVE_GRAM,
      extraArgs: rt.GenericExtraArgsV2.create({
        gasLimit: null,
        allowOutOfOrderExecution: true,
      }), // absent gasLimit: the quoter must apply the default
    })

    // Get the fee off-chain to know how much value to send
    const offchainFee = await getValidatedFee(
      blockchain,
      router.address,
      ccipSendWithEmptyExtraArgs,
    )
    const totalSendValue = offchainFee + ccipSendCost

    const result = await router.sendRouterCCIPSend(
      sender.getSender(),
      totalSendValue,
      ccipSendWithEmptyExtraArgs,
    )

    // The full flow should succeed
    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: onRamp.address,
      success: true,
    })

    // Find and decode the CCIPMessageSent event
    const ccipMessageSentTopic = BigInt(crc32(LogTypes.CCIPMessageSent))
    const ccipMessageSentExternal = getExternals(result.transactions).find((msg) => {
      if (msg.info.type !== 'external-out') return false
      if (!msg.info.src.equals(onRamp.address)) return false
      if (!msg.info.dest) return false
      return msg.info.dest.value === ccipMessageSentTopic
    })

    expect(ccipMessageSentExternal).toBeDefined()
    if (!ccipMessageSentExternal || !ccipMessageSentExternal.body) {
      throw new Error('CCIPMessageSent event not found')
    }

    const event = or.CCIPMessageSent.fromSlice(ccipMessageSentExternal.body.beginParse())

    // The ramp message body should contain extra args that are no longer empty.
    // The FeeQuoter should have applied the default gas limit from the dest chain config.
    const extraArgs = event.message.body.extraArgs
    if (extraArgs.$ !== 'GenericExtraArgsV2') {
      throw new Error(`Unexpected extraArgs kind: ${extraArgs.$}`)
    }
    expect(extraArgs.gasLimit).toBe(1n) // The defaultTxGasLimit in Router.Setup is 1
    expect(extraArgs.allowOutOfOrderExecution).toBe(true)
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      await coverage.generateCoverageArtifacts(
        blockchain,
        'router_e2e',
        await contractsCoverageConfig(),
      )
    }
  })
})

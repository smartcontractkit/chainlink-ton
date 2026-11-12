import { toNano, Address, Cell } from '@ton/core'
import { Blockchain } from '@ton/sandbox'
import { findTransactionRequired, flattenTransaction } from '@ton/test-utils'

import { generateMockTonAddress } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'
import { assertLog } from '../../Logs'
import { filterMessagesByType, findMessageRequiredByType } from '../../utils/messages'
import {
  buildRichBounceBody,
  RichBounce,
  RichBounceComputeSkipReason,
  RichBouncePhase,
} from '../../utils/richBounce'
import { sendBouncedMessage } from '../../utils/sendInternalMessage'
import { TolkError } from '../../utils/tvmErrors'
import { ChainSelectors } from '../../utils/Selectors'
import generateMessageID from '../../../src/offramp/generateMessageID'

import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as fq from '../../../wrappers/gen/ccip/FeeQuoter'
import * as rx from '../../../wrappers/gen/ccip/ReceiveExecutor'

import * as CCIPLogs from '../../../wrappers/ccip/Logs'

import { OffRampTestSetup, getDefaultMetadataHash } from './OffRamp.Setup'

export const PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS = BigInt(60)
describe('OffRamp - Commit and Execute', () => {
  let blockchain: Blockchain
  let setup: OffRampTestSetup

  // Helper functions for configuration and data creation
  //
  const warpTime = (period: number) => {
    blockchain.now = blockchain.now!! + period
  }

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    blockchain.now = 10000
    setup = await OffRampTestSetup.Init(blockchain)
  })

  beforeEach(async () => {
    await setup.SetupContracts()
  }, 60000) // setup can take a while, since we deploy contracts

  describe('Bounced Message Handling Tests', () => {
    it('should handle RouteMessage bounce from router and emit events', async () => {
      // Create a mock router that will bounce messages
      const wrongRouterAddress = generateMockTonAddress()

      // Update source chain config to use a non-existent router
      const configsWithWrongRouter = setup.createDefaultUpdateSourceChainConfigs({
        router: wrongRouterAddress,
      })

      await setup.setupOCRConfigs()
      await setup.offRamp.sendOffRampUpdateSourceChainConfigs(
        setup.deployer.getSender(),
        toNano('0.5'),
        {
          configs: configsWithWrongRouter,
        },
      )

      // Create and commit a message to a valid receiver
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address)
      const metadataHash = getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )
      const rootBytes = generateMessageID(message, metadataHash)
      const root = setup.createMerkleRoot(1n, 1n, rootBytes)

      await setup.commitReport([root])

      // Try to execute - the Router_RouteMessage should bounce
      const report = setup.createExecuteReport([message])
      const result = await setup.executeReport(report)

      // The OffRamp should emit ExecutionStateChanged to IN_PROGRESS
      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.InProgress,
        },
      )

      // Should bounce from the non-existent router
      expect(result.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        to: wrongRouterAddress,
        success: false,
      })

      // Should emit RouteMessageBounced event
      assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.RouteMessageBounced, {
        router: wrongRouterAddress,
        execId: expect.any(BigInt),
      })

      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Failure,
        },
      )
    })

    it('should handle Deployable_Initialize bounce and emit events', async () => {
      await setup.setupOCRConfigs()

      // Try committing the same root twice. This should normally never happen because the seqNr
      // would not match, but we can intentionally build a commit report with correct seqNr
      const message1 = setup.createTestMessage(1n, 1n, setup.receiver.address)
      const rootBytes = generateMessageID(
        message1,
        getDefaultMetadataHash(ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001),
      )
      const root = setup.createMerkleRoot(1n, 1n, rootBytes)

      await setup.commitReport([root])

      const root2 = setup.createMerkleRoot(2n, 2n, rootBytes)

      const result = await setup.commitReport([root2])

      expect(result.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        success: false,
        to: setup.merkleRootAddress(root2),
      })

      expect(result.transactions).toHaveTransaction({
        from: setup.merkleRootAddress(root2),
        success: true,
        to: setup.offRamp.address,
      })

      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.DeployableInitializeBounced,
        {
          deployableAddress: setup.merkleRootAddress(root2),
        },
      )
    })

    // A ReceiveExecutor deploy cannot be made to fail through the normal flow (its code is the
    // real, inlined ReceiveExecutor bytecode). These tests inject the rich bounce the OffRamp would
    // receive, built from the real Deployable_Initialize / InitExecute it sent.
    describe('ReceiveExecutor deploy and InitExecute bounces', () => {
      const bounceToOffRamp = (from: Address, bounce: RichBounce) =>
        sendBouncedMessage(blockchain, from, {
          to: setup.offRamp.address,
          value: toNano('0.1'),
          body: buildRichBounceBody(bounce),
        })

      // Executes a message whose Router does not exist: the executor is deployed, the delivery
      // bounces and the message ends Failure, so it can be manually executed again.
      const failMessageWithDeployedExecutor = async () => {
        await setup.setupOCRConfigs()
        await setup.offRamp.sendOffRampUpdateSourceChainConfigs(
          setup.deployer.getSender(),
          toNano('0.5'),
          {
            configs: setup.createDefaultUpdateSourceChainConfigs({
              router: generateMockTonAddress(),
            }),
          },
        )
        const message = setup.createTestMessage(1n, 1n, setup.receiver.address)
        const rootBytes = generateMessageID(
          message,
          getDefaultMetadataHash(ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001),
        )
        const root = setup.createMerkleRoot(1n, 1n, rootBytes)
        await setup.commitReport([root])
        const report = setup.createExecuteReport([message])
        const result = await setup.executeReport(report)

        const { to: executor, body: initExecute } = flattenTransaction(
          findTransactionRequired(result.transactions, {
            from: setup.offRamp.address,
            op: of.ReceiveExecutor_InitExecute.PREFIX,
          }),
        )
        const { body: initialize } = flattenTransaction(
          findTransactionRequired(result.transactions, {
            from: setup.offRamp.address,
            to: executor,
            op: of.Deployable_Initialize.PREFIX,
          }),
        )
        assertLog(
          result.transactions,
          setup.offRamp.address,
          CCIPLogs.LogTypes.ExecutionStateChanged,
          { sequenceNumber: 1n, state: of.ExecutionState.Failure },
        )

        // Restore the Router, so a retry can deliver the message.
        await setup.offRamp.sendOffRampUpdateSourceChainConfigs(
          setup.deployer.getSender(),
          toNano('0.5'),
          { configs: setup.createDefaultUpdateSourceChainConfigs({ minSeqNr: 2n }) },
        )

        return {
          report,
          root: setup.merkleRootAddress(root),
          executor: executor!,
          initExecute: initExecute!,
          initialize: initialize!,
        }
      }

      it.each([
        ['reached the Deployable stub', RichBouncePhase.ComputeFailed, TolkError.OpcodeMismatch],
        ['found no contract', RichBouncePhase.ComputeSkipped, RichBounceComputeSkipReason.NoState],
      ])(
        'should make the next attempt deploy the executor when InitExecute %s',
        async (_, bouncedByPhase, exitCode) => {
          const { report, root, executor, initExecute } = await failMessageWithDeployedExecutor()

          const bounced = await bounceToOffRamp(executor, {
            originalBody: initExecute,
            bouncedByPhase,
            exitCode,
          })
          assertLog(
            bounced.transactions,
            setup.offRamp.address,
            CCIPLogs.LogTypes.ReceiveExecutorInitExecuteBounced,
            { receiveExecutor: executor, root, sequenceNumber: 1n },
          )
          const [markState, ...others] = filterMessagesByType(
            bounced.transactions,
            of.MerkleRoot_MarkState,
            { to: root },
          )
          expect(others).toHaveLength(0)
          expect(markState.state).toBe(of.ExecutionState.Failure)
          expect(markState.executorDeployFailed).toBe(true)
          expect(bounced.transactions).toHaveTransaction({
            from: root,
            to: setup.offRamp.address,
            success: true,
          })

          // The retry deploys the executor again. It already exists here, so the Deployable_Initialize
          // bounces: its value goes back to the caller and the message state is left to the InitExecute.
          const retry = await setup.manualExecuteReport(report)
          expect(
            findMessageRequiredByType(retry.transactions, of.OffRamp_ExecuteValidated, {
              to: setup.offRamp.address,
            }).deployExecutor,
          ).toBe(true)
          expect(retry.transactions).toHaveTransaction({
            from: setup.offRamp.address,
            to: executor,
            op: of.Deployable_Initialize.PREFIX,
            success: false,
          })
          const initializeBounce = findTransactionRequired(retry.transactions, {
            from: executor,
            to: setup.offRamp.address,
            inMessageBounced: true,
          })
          assertLog(
            [initializeBounce],
            setup.offRamp.address,
            CCIPLogs.LogTypes.DeployableInitializeBounced,
            {
              deployableAddress: executor,
            },
          )
          const refunds = [...initializeBounce.outMessages.values()].filter(
            (m) => m.info.type === 'internal',
          )
          expect(refunds).toHaveLength(1)
          expect(refunds[0].info.dest).toEqualAddress(setup.transmitters[0].address)
          expect(refunds[0].body.equals(Cell.EMPTY)).toBe(true)

          // The InitExecute ran on the existing executor: a single MarkState, Success.
          const retryMarkStates = filterMessagesByType(
            retry.transactions,
            of.MerkleRoot_MarkState,
            {
              to: root,
            },
          )
          expect(retryMarkStates).toHaveLength(1)
          expect(retryMarkStates[0].state).toBe(of.ExecutionState.Success)
          expect(retryMarkStates[0].executorDeployFailed).toBe(false)
          assertLog(
            retry.transactions,
            setup.offRamp.address,
            CCIPLogs.LogTypes.ExecutionStateChanged,
            {
              sequenceNumber: 1n,
              state: of.ExecutionState.Success,
            },
          )
        },
      )

      it('should not deploy the executor again when the executor rejected InitExecute', async () => {
        const { report, root, executor, initExecute } = await failMessageWithDeployedExecutor()

        const bounced = await bounceToOffRamp(executor, {
          originalBody: initExecute,
          bouncedByPhase: RichBouncePhase.ComputeFailed,
          exitCode: rx.ReceiveExecutor.Errors['ReceiveExecutor_Error.MessageAlreadyExecuted'],
        })
        const markStates = filterMessagesByType(bounced.transactions, of.MerkleRoot_MarkState, {
          to: root,
        })
        expect(markStates).toHaveLength(1)
        expect(markStates[0].state).toBe(of.ExecutionState.Failure)
        expect(markStates[0].executorDeployFailed).toBe(false)

        const retry = await setup.manualExecuteReport(report)
        expect(
          findMessageRequiredByType(retry.transactions, of.OffRamp_ExecuteValidated, {
            to: setup.offRamp.address,
          }).deployExecutor,
        ).toBe(false)
        expect(retry.transactions).not.toHaveTransaction({
          from: setup.offRamp.address,
          to: executor,
          op: of.Deployable_Initialize.PREFIX,
        })
        assertLog(
          retry.transactions,
          setup.offRamp.address,
          CCIPLogs.LogTypes.ExecutionStateChanged,
          {
            sequenceNumber: 1n,
            state: of.ExecutionState.Success,
          },
        )
      })

      it('should refund a bounced executor deploy to the caller without marking the message', async () => {
        const { root, executor, initialize } = await failMessageWithDeployedExecutor()

        // The executor already exists and rejects the unknown opcode.
        const bounced = await bounceToOffRamp(executor, {
          originalBody: initialize,
          bouncedByPhase: RichBouncePhase.ComputeFailed,
          exitCode: 0xffff,
        })
        assertLog(
          bounced.transactions,
          setup.offRamp.address,
          CCIPLogs.LogTypes.DeployableInitializeBounced,
          {
            deployableAddress: executor,
          },
        )
        expect(
          filterMessagesByType(bounced.transactions, of.MerkleRoot_MarkState, { to: root }),
        ).toHaveLength(0)
        expect(bounced.transactions).toHaveTransaction({
          from: setup.offRamp.address,
          to: setup.transmitters[0].address,
          body: Cell.EMPTY,
        })
      })
    })

    it('should handle a FeeQuoter_UpdatePrices bounce and emit UpdatePricesBounced', async () => {
      await setup.setupOCRConfig()

      // Remove the OffRamp as a price updater, so the FeeQuoter rejects the update.
      const removeResult = await setup.feeQuoter.sendFeeQuoterRemovePriceUpdater(
        setup.deployer.getSender(),
        toNano('0.01'),
        { priceUpdater: setup.offRamp.address },
      )
      expect(removeResult.transactions).toHaveTransaction({
        from: setup.deployer.address,
        to: setup.feeQuoter.address,
        success: true,
      })

      // Commit a report with price updates. The FeeQuoter throws UnauthorizedPriceUpdater.
      const sourceToken = generateMockTonAddress()
      const priceUpdates = of.PriceUpdates.create({
        tokenPriceUpdates: [of.TokenPriceUpdate.create({ sourceToken, usdPerToken: 1n })],
        gasPriceUpdates: [],
      })
      const result = await setup.commitReport([], toNano('0.5'), 0x01, priceUpdates)

      // The FeeQuoter rejected the update.
      expect(result.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        to: setup.feeQuoter.address,
        success: false,
        exitCode: fq.FeeQuoter.Errors['FeeQuoter_Error.UnauthorizedPriceUpdater'],
      })

      // The OffRamp handled the rich bounce and emitted UpdatePricesBounced.
      expect(result.transactions).toHaveTransaction({
        to: setup.offRamp.address,
        op: 0xfffffffe,
        success: true,
      })
      assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.UpdatePricesBounced, {
        feeQuoter: setup.feeQuoter.address,
        errorCode: BigInt(fq.FeeQuoter.Errors['FeeQuoter_Error.UnauthorizedPriceUpdater']),
      })
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      const testSuitePrefix = 'offramp_suite'
      await coverage.generateCoverageArtifacts(blockchain, testSuitePrefix, [
        {
          code: setup.code.offRamp,
          name: 'offramp',
        },
        {
          code: setup.code.router,
          name: 'router',
        },
        {
          code: setup.code.feeQuoter,
          name: 'feequoter',
        },
        {
          code: setup.code.merkleRoot,
          name: 'merkleroot',
        },
        {
          code: setup.code.receiveExecutor,
          name: 'receive_executor',
        },
      ])
    }
  })
})

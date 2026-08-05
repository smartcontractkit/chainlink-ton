import { toNano, beginCell, Address } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import { generateMockTonAddress } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'
import { assertLog } from '../../Logs'
import { ChainSelectors } from '../../utils/Selectors'
import generateMessageID from '../../../src/offramp/generateMessageID'

import * as of from '../../../wrappers/gen/ccip/OffRamp'

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

    it('should handle ReceiveExecutor_InitExecute bounce and emit events', async () => {
      // First, commit report with a valid message
      const message1 = setup.createTestMessage(1n, 1n, setup.receiver.address)
      await setup.setupAndCommitMessage(message1)

      // Update receiveExecutorCode to bad code that will cause InitExecute to bounce
      const badReceiveExecutorCode = beginCell().storeUint(0x88888888, 32).endCell()
      await setup.offRamp.sendOffRampUpdateDeployables(setup.deployer.getSender(), toNano('0.1'), {
        receiveExecutorCode: badReceiveExecutorCode,
        merkleRootCode: setup.code.merkleRoot,
      })

      const report = setup.createExecuteReport([message1])
      // Execute the second message
      const result = await setup.executeReport(report)

      // Should emit IN_PROGRESS
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

      // InitExecute should fail
      expect(result.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        success: false,
      })

      // Should emit ReceiveExecutorInitExecuteBounced
      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ReceiveExecutorInitExecuteBounced,
        {
          receiveExecutor: expect.any(Address),
          root: expect.any(Address),
          sequenceNumber: 1n,
        },
      )

      // Should emit ExecutionStateChanged: FAILURE
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

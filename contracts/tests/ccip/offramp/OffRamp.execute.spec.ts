import { Cell, toNano, beginCell } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import { generateMockTonAddress, asSnakedCell } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'
import { MerkleHelper } from '../../lib/merkle_proof/helpers/MerkleMultiProofHelper'
import { assertLog } from '../../Logs'
import { ChainSelectors } from '../../utils/Selectors'
import generateMessageID from '../../../src/offramp/generateMessageID'

import { contractCode } from '../../../wrappers/codeLoader'
import * as ocr from '../../../wrappers/libraries/ocr/MultiOCR3Base'

import * as mr from '../../../wrappers/gen/ccip/MerkleRoot'
import * as rx from '../../../wrappers/gen/ccip/ReceiveExecutor'
import * as tr from '../../../wrappers/examples/Receiver'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as tp from '../../../wrappers/gen/ccip/pools/TokenPool'
import * as trg from '../../../wrappers/gen/ccip/TokenRegistry'

import * as CCIPLogs from '../../../wrappers/ccip/Logs'
import { RMNREMOTE_GLOBAL_CURSE_SUBJECT } from '../../../wrappers/ccip/Router'

import * as s from './OffRamp.Setup'
import { OffRampWithTokenPoolTestSetup } from './OffRamp.Setup'

export const PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS = BigInt(60)
describe('OffRamp - Execute', () => {
  let blockchain: Blockchain
  let setup: s.OffRampTestSetup

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
    setup = await s.OffRampTestSetup.Init(blockchain)
  })

  beforeEach(async () => {
    await setup.SetupContracts()
  }, 60000) // setup can take a while, since we deploy contracts

  it('should deploy', async () => {
    // the check is done inside beforeEach
    // blockchain and counter are ready to use
  })

  describe('Execute', () => {
    it('should fail when root was not committed', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address)

      // Setup configurations but don't commit any report
      await setup.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)
      await setup.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_EXECUTE, {
        signers: [],
        isSignatureVerificationEnabled: false,
      })
      await setup.setupSourceChainConfig()

      // Try to execute without committing
      const executeReport = of.ExecutionReport.create({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        messages: asSnakedCell([message], (msg) =>
          (() => {
            const b = beginCell()
            of.Any2TVMRampMessage.store(msg, b)
            return b
          })(),
        ),
        offchainTokenData: Cell.EMPTY,
        proofs: [],
        proofFlagBits: 0n,
      })

      const executeResult = await setup.offRamp.sendOffRampExecute(
        setup.transmitters[0].getSender(),
        toNano('0.5'),
        {
          reportContext: of.ReportContext.create({
            configDigest: setup.configDigest,
            sequenceBytes: 0x02n,
          }),
          report: executeReport,
        },
      )

      // We expect our message to succeed but the message from the offRamp to MerkleRoot should fail
      expect(executeResult.transactions).toHaveTransaction({
        from: setup.transmitters[0].address,
        to: setup.offRamp.address,
        success: true, // The execute call itself succeeds
      })

      expect(executeResult.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        success: false,
      })

      // Check that no message was sent to the receiver (message processing failed)
      expect(executeResult.transactions).not.toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
      })
    })

    it('should fail when different root was committed', async () => {
      const message = setup.createTestMessage(2n, 2n, setup.receiver.address)
      const differentMessage = setup.createTestMessage(1n, 1n, setup.receiver.address)

      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )
      const differentRootBytes = generateMessageID(differentMessage, metadataHash)
      const differentRoot = setup.createMerkleRoot(1n, 1n, differentRootBytes)

      // Setup configurations
      await setup.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)
      await setup.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_EXECUTE, {
        signers: [],
        isSignatureVerificationEnabled: false,
      })
      await setup.setupSourceChainConfig()

      // Commit a different merkle root than what we'll try to execute
      await setup.commitReport([differentRoot])

      // Try to execute with the original message (not the one in the committed root)
      const executeReport = of.ExecutionReport.create({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        messages: asSnakedCell([message], (msg) =>
          (() => {
            const b = beginCell()
            of.Any2TVMRampMessage.store(msg, b)
            return b
          })(),
        ),
        offchainTokenData: Cell.EMPTY,
        proofs: [],
        proofFlagBits: 0n,
      })

      const executeResult = await setup.offRamp.sendOffRampExecute(
        setup.transmitters[0].getSender(),
        toNano('0.5'),
        {
          reportContext: of.ReportContext.create({
            configDigest: setup.configDigest,
            sequenceBytes: 0x02n,
          }),
          report: executeReport,
        },
      )

      expect(executeResult.transactions).toHaveTransaction({
        from: setup.transmitters[0].address,
        to: setup.offRamp.address,
        success: true,
      })

      expect(executeResult.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        success: false,
      })

      // Check that no message was sent to the receiver (message verification failed)
      expect(executeResult.transactions).not.toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
      })
    })

    it('should fail same message twice', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address)
      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )
      const rootBytes = generateMessageID(message, metadataHash)
      const root = setup.createMerkleRoot(1n, 1n, rootBytes)

      // Setup configurations
      await setup.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)
      await setup.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_EXECUTE, {
        signers: [],
        isSignatureVerificationEnabled: false,
      })
      await setup.setupSourceChainConfig()

      // Send the commit report
      await setup.commitReport([root])

      // Create the execute report
      const executeReport = of.ExecutionReport.create({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        messages: asSnakedCell([message], (msg) =>
          (() => {
            const b = beginCell()
            of.Any2TVMRampMessage.store(msg, b)
            return b
          })(),
        ),
        offchainTokenData: Cell.EMPTY,
        proofs: [],
        proofFlagBits: 0n,
      })

      // First execution should succeed
      const firstExecuteResult = await setup.offRamp.sendOffRampExecute(
        setup.transmitters[0].getSender(),
        toNano('0.5'),
        {
          reportContext: of.ReportContext.create({
            configDigest: setup.configDigest,
            sequenceBytes: 0x02n,
          }),
          report: executeReport,
        },
      )

      expect(firstExecuteResult.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        success: true,
      })

      // Second execution with the same report should fail
      const secondExecuteResult = await setup.offRamp.sendOffRampExecute(
        setup.transmitters[0].getSender(),
        toNano('0.5'),
        {
          reportContext: of.ReportContext.create({
            configDigest: setup.configDigest,
            sequenceBytes: 0x02n,
          }),
          report: executeReport,
        },
      )

      // The execute call itself should succeed but the message processing should fail
      expect(secondExecuteResult.transactions).toHaveTransaction({
        from: setup.transmitters[0].address,
        to: setup.offRamp.address,
        success: true,
      })

      // There should be a failed transaction with the specific error code from offRamp to MerkleRoot
      expect(secondExecuteResult.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.SkippedAlreadyExecutedMessage'],
        success: false,
      })
    })

    it('should fail empty report', async () => {
      await setup.setupOCRConfigs()
      const report = setup.createExecuteReport([])
      await setup.executeReportExpectingFailure(
        report,
        of.OffRamp.Errors['OffRamp_Error.EmptyExecutionReport'],
      )
    })

    it('should fail when message destChainSelector is wrong', async () => {
      const wrongDestMessage = setup.createTestMessage(1n, 1n, setup.receiver.address)
      wrongDestMessage.header.destChainSelector = 999999n

      await setup.setupAndCommitMessage(wrongDestMessage)
      const report = setup.createExecuteReport([wrongDestMessage])
      await setup.executeReportExpectingFailure(
        report,
        of.OffRamp.Errors['OffRamp_Error.InvalidMessageDestChainSelector'],
      )
    })

    it('should fail when message sourceChainSelector mismatches report', async () => {
      const wrongSourceMessage = setup.createTestMessage(1n, 1n, setup.receiver.address)
      wrongSourceMessage.header.sourceChainSelector = 888888n

      await setup.setupAndCommitMessage(wrongSourceMessage)
      const report = setup.createExecuteReport(
        [wrongSourceMessage],
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      ) // Different from message
      await setup.executeReportExpectingFailure(
        report,
        of.OffRamp.Errors['OffRamp_Error.SourceChainSelectorMismatch'],
      )
    })

    it('should fail when source chain is disabled', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address)

      // Setup and commit with enabled chain
      await setup.setupOCRConfigs()
      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )
      const rootBytes = generateMessageID(message, metadataHash)
      const root = setup.createMerkleRoot(1n, 1n, rootBytes)
      await setup.commitReport([root])

      // Disable source chain for execution
      await setup.setupSourceChainConfig({ isEnabled: false }, false)

      const report = setup.createExecuteReport([message])
      await setup.executeReportExpectingFailure(
        report,
        of.OffRamp.Errors['OffRamp_Error.SourceChainNotEnabled'],
      )
    })

    it('should fail when source chain is cursed', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address)

      // Setup and commit with enabled chain
      await setup.setupOCRConfigs()
      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )
      const rootBytes = generateMessageID(message, metadataHash)
      const root = setup.createMerkleRoot(1n, 1n, rootBytes)
      await setup.commitReport([root])

      // Curse source chain
      let result = await setup.offRamp.sendOffRampUpdateCursedSubjects(
        setup.deployer.getSender(),
        toNano('0.5'),
        {
          cursedSubjects: s.buildCursedSubjects(
            new Set([ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001]),
          ),
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: setup.deployer.address,
        to: setup.offRamp.address,
        success: true,
      })

      const report = setup.createExecuteReport([message])
      await setup.executeReportExpectingFailure(
        report,
        of.OffRamp.Errors['OffRamp_Error.SubjectCursed'],
      )

      // Uncurse source chain
      result = await setup.offRamp.sendOffRampUpdateCursedSubjects(
        setup.deployer.getSender(),
        toNano('0.5'),
        {
          cursedSubjects: of.CursedSubjects.create({ data: new Set([]) }),
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: setup.deployer.address,
        to: setup.offRamp.address,
        success: true,
      })
    })

    it('should fail when source chain is globally cursed', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address)

      // Setup and commit with enabled chain
      await setup.setupOCRConfigs()
      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )
      const rootBytes = generateMessageID(message, metadataHash)
      const root = setup.createMerkleRoot(1n, 1n, rootBytes)
      await setup.commitReport([root])

      // Curse source chain
      let result = await setup.offRamp.sendOffRampUpdateCursedSubjects(
        setup.deployer.getSender(),
        toNano('0.5'),
        {
          cursedSubjects: of.CursedSubjects.create({
            data: new Set([RMNREMOTE_GLOBAL_CURSE_SUBJECT]),
          }),
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: setup.deployer.address,
        to: setup.offRamp.address,
        success: true,
      })

      const report = setup.createExecuteReport([message])
      await setup.executeReportExpectingFailure(
        report,
        of.OffRamp.Errors['OffRamp_Error.SubjectCursed'],
      )

      // Uncurse source chain
      result = await setup.offRamp.sendOffRampUpdateCursedSubjects(
        setup.deployer.getSender(),
        toNano('0.5'),
        {
          cursedSubjects: of.CursedSubjects.create({ data: new Set([]) }),
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: setup.deployer.address,
        to: setup.offRamp.address,
        success: true,
      })
    })

    it('should fail when source chain config does not exist', async () => {
      const unknownChainSelector = 777777n
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address)
      message.header.sourceChainSelector = unknownChainSelector

      await setup.setupOCRConfigs()
      const report = setup.createExecuteReport([message], unknownChainSelector)
      await setup.executeReportExpectingFailure(
        report,
        of.OffRamp.Errors['OffRamp_Error.SourceChainNotEnabled'],
      )
    })

    it('should succeed when valid message matches proof', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address)
      await setup.setupAndCommitMessage(message)

      const report = setup.createExecuteReport([message])
      const result = await setup.executeReport(report)

      // Message should be successfully processed to the receiver
      expect(result.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        success: true,
      })

      assertLog(
        result.transactions,
        setup.receiver.address,
        CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
        {
          message: of.Any2TVMMessage.create({
            messageId: message.header.messageId,
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            sender: message.sender,
            data: message.data,
            tokenAmounts: null,
          }),
        },
      )
      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          messageId: message.header.messageId,
          state: of.ExecutionState.InProgress,
        },
      )
      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          messageId: message.header.messageId,
          state: of.ExecutionState.Success,
        },
      )
    })

    it('should fail when valid message matches proof but gaslimit is low', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address)
      message.gasLimit = toNano('0.0001') // Set very low gas limit to force failure
      await setup.setupAndCommitMessage(message)

      const report = setup.createExecuteReport([message])
      const result = await setup.executeReport(report)

      // Message should fail due to low gas limit
      expect(result.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        success: true,
        op: rx.ReceiveExecutor_Bounced.PREFIX,
      })

      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          messageId: message.header.messageId,
          state: of.ExecutionState.InProgress,
        },
      )
      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          messageId: message.header.messageId,
          state: of.ExecutionState.Failure,
        },
      )
    })

    it('should emit ExecutionStateChanged: Success when receiver notifies success with non-empty data', async () => {
      const data = beginCell().storeUint(1, 1).endCell() // receiver now accepts data
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address, data)

      await setup.setupAndCommitMessage(message)
      const report = setup.createExecuteReport([message])
      const result = await setup.executeReport(report)

      // Message should be successfully processed by the receiver
      expect(result.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        value: message.gasLimit,
        success: true,
      })

      expect(result.transactions).toHaveTransaction({
        from: setup.receiver.address,
        to: setup.router.address,
        success: true,
      })

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

      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Success,
        },
      )

      assertLog(
        result.transactions,
        setup.receiver.address,
        CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
        {
          message: of.Any2TVMMessage.create({
            messageId: message.header.messageId,
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            sender: message.sender,
            data: message.data,
            tokenAmounts: null,
          }),
        },
      )
    })

    it('should emit ExecutionStateChanged: Success when receiver notifies success with empty data', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address) // empty data (Cell.EMPTY)
      await setup.setupAndCommitMessage(message)
      const report = setup.createExecuteReport([message])
      const result = await setup.executeReport(report)

      expect(result.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        success: true,
      })

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

      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Success,
        },
      )

      assertLog(
        result.transactions,
        setup.receiver.address,
        CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
        {
          message: of.Any2TVMMessage.create({
            messageId: message.header.messageId,
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            sender: message.sender,
            data: message.data,
            tokenAmounts: null,
          }),
        },
      )
    })

    describe('should succeed and OffRamp', () => {
      it('should emit ExecutionStateChanged: Failure when receiver rejects message from wrong offRamp', async () => {
        // Deploy a receiver with WRONG offRamp address - it will reject messages from the real offRamp
        let code = await contractCode.ccip.local('ccip.test.receiver')

        const result = await setup.receiver.sendUpdateBehavior(
          setup.deployer.getSender(),
          toNano('0.1'),
          {
            behavior: tr.ReceiverBehavior.RejectAll,
          },
        )
        expect(result.transactions).toHaveTransaction({
          from: setup.deployer.address,
          to: setup.receiver.address,
          success: true,
        })

        // Send message to the bad receiver
        const message = setup.createTestMessage(1n, 1n, setup.receiver.address)
        await setup.setupAndCommitMessage(message)
        const report = setup.createExecuteReport([message])
        const executeResult = await setup.executeReport(report)

        // The execute call itself should succeed
        expect(executeResult.transactions).toHaveTransaction({
          from: setup.transmitters[0].address,
          to: setup.offRamp.address,
          success: true,
        })

        // Message should bounce from the bad receiver (wrong offRamp check fails)
        expect(executeResult.transactions).toHaveTransaction({
          from: setup.router.address,
          to: setup.receiver.address,
          success: false,
        })

        // Should emit IN_PROGRESS first
        assertLog(
          executeResult.transactions,
          setup.offRamp.address,
          CCIPLogs.LogTypes.ExecutionStateChanged,
          {
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            sequenceNumber: 1n,
            messageId: 1n,
            state: of.ExecutionState.InProgress,
          },
        )

        // Should emit FAILURE after bounce
        assertLog(
          executeResult.transactions,
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

    it('should reject DispatchValidated from non-offramp address', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address)
      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )

      const messageIdSlice = beginCell()
        .storeUint(generateMessageID(message, metadataHash), 256)
        .asSlice()
      const execId = messageIdSlice.loadUintBig(192)

      const result = await setup.offRamp.sendOffRampDispatchValidated(
        setup.deployer.getSender(),
        toNano('0.5'),
        {
          message,
          execId: execId,
          gasOverride: null,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: setup.deployer.address,
        to: setup.offRamp.address,
        success: false,
        exitCode: of.OffRamp.Errors['OffRamp_Error.MessageNotFromOwnedContract'],
      })
    })
  })

  describe('Manual Execution', () => {
    it('should succeed after permissionlessExecutionThresholdSeconds', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address) // empty data (Cell.EMPTY)
      await setup.setupAndCommitMessage(message)
      const report = setup.createExecuteReport([message])

      // Try manual exec when is not enabled
      const manualExecFirstAttempt = await setup.manualExecuteReport(report)
      expect(manualExecFirstAttempt.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.ManualExecutionNotYetEnabled'],
      })

      // Almost there, still needs to fail
      warpTime(Number(PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS))

      const manualExecSecondAttempt = await setup.manualExecuteReport(report)
      expect(manualExecSecondAttempt.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        success: false,
        exitCode: mr.MerkleRoot.Errors['MerkleRoot_Error.ManualExecutionNotYetEnabled'],
      })

      // One more sec and we are ready to go
      warpTime(1)

      const manualExecThirdAttempt = await setup.manualExecuteReport(report, undefined, true)
      expect(manualExecThirdAttempt.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        value: message.gasLimit,
        success: true,
      })

      assertLog(
        manualExecThirdAttempt.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.InProgress,
        },
      )

      assertLog(
        manualExecThirdAttempt.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Success,
        },
      )

      assertLog(
        manualExecThirdAttempt.transactions,
        setup.receiver.address,
        CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
        {
          message: of.Any2TVMMessage.create({
            messageId: message.header.messageId,
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            sender: message.sender,
            data: message.data,
            tokenAmounts: null,
          }),
        },
      )
    })

    it('should succeed when receiver initially fails', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address) // empty data (Cell.EMPTY)
      await setup.setupAndCommitMessage(message)
      const report = setup.createExecuteReport([message])

      const result = await setup.receiver.sendUpdateBehavior(
        setup.deployer.getSender(),
        toNano('0.1'),
        {
          behavior: tr.ReceiverBehavior.RejectAll,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: setup.deployer.address,
        to: setup.receiver.address,
        success: true,
      })

      const result2 = await setup.executeReport(report)
      expect(result2.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        success: false,
      })

      assertLog(
        result2.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Failure,
        },
      )

      const result3 = await setup.receiver.sendUpdateBehavior(
        setup.deployer.getSender(),
        toNano('0.1'),
        {
          behavior: tr.ReceiverBehavior.Accept,
        },
      )
      expect(result3.transactions).toHaveTransaction({
        from: setup.deployer.address,
        to: setup.receiver.address,
        success: true,
      })

      //try manual exec
      const gasOverride = toNano('0.05')
      const result4 = await setup.manualExecuteReport(report, gasOverride, true)

      expect(result4.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        value: gasOverride,
        success: true,
      })

      assertLog(
        result4.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.InProgress,
        },
      )

      assertLog(
        result4.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Success,
        },
      )

      assertLog(
        result4.transactions,
        setup.receiver.address,
        CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
        {
          message: of.Any2TVMMessage.create({
            messageId: message.header.messageId,
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            sender: message.sender,
            data: message.data,
            tokenAmounts: null,
          }),
        },
      )
    })

    it('should ignore gasOverride lower than original gasLimit', async () => {
      const message = setup.createTestMessage(1n, 1n, setup.receiver.address) // empty data (Cell.EMPTY)
      await setup.setupAndCommitMessage(message)
      const report = setup.createExecuteReport([message])
      const result = await setup.receiver.sendUpdateBehavior(
        setup.deployer.getSender(),
        toNano('0.1'),
        {
          behavior: tr.ReceiverBehavior.RejectAll,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: setup.deployer.address,
        to: setup.receiver.address,
        success: true,
      })

      const result2 = await setup.executeReport(report)
      expect(result2.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        success: false,
      })

      assertLog(
        result2.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Failure,
        },
      )

      const result3 = await setup.receiver.sendUpdateBehavior(
        setup.deployer.getSender(),
        toNano('0.1'),
        {
          behavior: tr.ReceiverBehavior.Accept,
        },
      )
      expect(result3.transactions).toHaveTransaction({
        from: setup.deployer.address,
        to: setup.receiver.address,
        success: true,
      })

      const gasOverride = message.gasLimit - 100n

      const result4 = await setup.manualExecuteReport(report, gasOverride, true)

      expect(result4.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        value: message.gasLimit,
        success: true,
      })

      assertLog(
        result4.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.InProgress,
        },
      )

      assertLog(
        result4.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Success,
        },
      )

      assertLog(
        result4.transactions,
        setup.receiver.address,
        CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
        {
          message: of.Any2TVMMessage.create({
            messageId: message.header.messageId,
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            sender: message.sender,
            data: message.data,
            tokenAmounts: null,
          }),
        },
      )
    })
  })

  describe('Commit multiple messages in one root and execute with proof', () => {
    it('Test commit two messages in one root and execute first message with proof', async () => {
      const message1 = setup.createTestMessage(1n, 1n, setup.receiver.address)
      const message2 = setup.createTestMessage(2n, 2n, setup.receiver.address)
      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )

      // Generate message IDs
      const messageId1 = generateMessageID(message1, metadataHash)
      const messageId2 = generateMessageID(message2, metadataHash)

      // Create merkle tree with both messages
      const merkleHelper = new MerkleHelper()

      const { proof, root: rootBytes } = merkleHelper.createTreeAndProve(
        [messageId1, messageId2],
        [0],
      )

      const root = setup.createMerkleRoot(1n, 2n, rootBytes)

      await setup.setupOCRConfigs()
      await setup.commitReport([root])

      // Convert proof to proofFlagBits format
      let proofFlagBits = 0n
      for (let i = 0; i < proof.sourceFlags.length; i++) {
        if (proof.sourceFlags[i]) {
          proofFlagBits |= 1n << BigInt(i)
        }
      }

      // Execute first message with proof
      const report = of.ExecutionReport.create({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        messages: asSnakedCell([message1], (msg) =>
          (() => {
            const b = beginCell()
            of.Any2TVMRampMessage.store(msg, b)
            return b
          })(),
        ),
        offchainTokenData: Cell.EMPTY,
        proofs: proof.hashes,
        proofFlagBits,
      })

      const result = await setup.executeReport(report)

      // First message should be successfully processed
      expect(result.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        success: true,
      })

      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Success,
        },
      )
    })

    it('Test commit two messages in one root and execute second message with proof', async () => {
      const message1 = setup.createTestMessage(1n, 1n, setup.receiver.address)
      const message2 = setup.createTestMessage(2n, 2n, setup.receiver.address)
      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )

      // Generate message IDs
      const messageId1 = generateMessageID(message1, metadataHash)
      const messageId2 = generateMessageID(message2, metadataHash)

      // Create merkle tree with both messages
      const merkleHelper = new MerkleHelper()

      const { proof, root: rootBytes } = merkleHelper.createTreeAndProve(
        [messageId1, messageId2],
        [1],
      )

      const root = setup.createMerkleRoot(1n, 2n, rootBytes)

      await setup.setupOCRConfigs()
      await setup.commitReport([root])

      // Convert proof to proofFlagBits format
      let proofFlagBits = 0n
      for (let i = 0; i < proof.sourceFlags.length; i++) {
        if (proof.sourceFlags[i]) {
          proofFlagBits |= 1n << BigInt(i)
        }
      }

      // Execute second message with proof
      const report = of.ExecutionReport.create({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        messages: asSnakedCell([message2], (msg) =>
          (() => {
            const b = beginCell()
            of.Any2TVMRampMessage.store(msg, b)
            return b
          })(),
        ),
        offchainTokenData: Cell.EMPTY,
        proofs: proof.hashes,
        proofFlagBits,
      })

      const result = await setup.executeReport(report)

      // Second message should be successfully processed
      expect(result.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        success: true,
      })

      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 2n,
          messageId: 2n,
          state: of.ExecutionState.Success,
        },
      )
    })

    it('Test commit two messages in one root and execute both messages sequentially', async () => {
      const message1 = setup.createTestMessage(1n, 1n, setup.receiver.address)
      const message2 = setup.createTestMessage(2n, 2n, setup.receiver.address)
      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )

      // Generate message IDs
      const messageId1 = generateMessageID(message1, metadataHash)
      const messageId2 = generateMessageID(message2, metadataHash)

      // Create merkle tree with both messages - IMPORTANT: We create it once and reuse for both proofs
      const merkleHelper = new MerkleHelper()

      const tree = merkleHelper.createTree([messageId1, messageId2])
      const rootBytes = tree.getRoot()
      const root = setup.createMerkleRoot(1n, 2n, rootBytes)

      await setup.setupOCRConfigs()
      await setup.commitReport([root])

      // Execute first message
      {
        const proof = tree.prove([0])
        let proofFlagBits = 0n
        for (let i = 0; i < proof.sourceFlags.length; i++) {
          if (proof.sourceFlags[i]) {
            proofFlagBits |= 1n << BigInt(i)
          }
        }

        const report = of.ExecutionReport.create({
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          messages: asSnakedCell([message1], (msg) =>
            (() => {
              const b = beginCell()
              of.Any2TVMRampMessage.store(msg, b)
              return b
            })(),
          ),
          offchainTokenData: Cell.EMPTY,
          proofs: proof.hashes,
          proofFlagBits,
        })

        const result = await setup.executeReport(report)

        expect(result.transactions).toHaveTransaction({
          from: setup.router.address,
          to: setup.receiver.address,
          success: true,
        })

        assertLog(
          result.transactions,
          setup.offRamp.address,
          CCIPLogs.LogTypes.ExecutionStateChanged,
          {
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            sequenceNumber: 1n,
            messageId: 1n,
            state: of.ExecutionState.Success,
          },
        )
      }

      // Execute second message
      {
        const proof = tree.prove([1])
        let proofFlagBits = 0n
        for (let i = 0; i < proof.sourceFlags.length; i++) {
          if (proof.sourceFlags[i]) {
            proofFlagBits |= 1n << BigInt(i)
          }
        }

        const report = of.ExecutionReport.create({
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          messages: asSnakedCell([message2], (msg) =>
            (() => {
              const b = beginCell()
              of.Any2TVMRampMessage.store(msg, b)
              return b
            })(),
          ),
          offchainTokenData: Cell.EMPTY,
          proofs: proof.hashes,
          proofFlagBits,
        })

        const result = await setup.executeReport(report)

        expect(result.transactions).toHaveTransaction({
          from: setup.router.address,
          to: setup.receiver.address,
          success: true,
        })

        assertLog(
          result.transactions,
          setup.offRamp.address,
          CCIPLogs.LogTypes.ExecutionStateChanged,
          {
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            sequenceNumber: 2n,
            messageId: 2n,
            state: of.ExecutionState.Success,
          },
        )
      }
    })

    it('Test execute with wrong proof fails', async () => {
      const message1 = setup.createTestMessage(1n, 1n, setup.receiver.address)
      const message2 = setup.createTestMessage(2n, 2n, setup.receiver.address)
      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )

      // Generate message IDs
      const messageId1 = generateMessageID(message1, metadataHash)
      const messageId2 = generateMessageID(message2, metadataHash)

      // Create merkle tree with both messages
      const merkleHelper = new MerkleHelper()

      const tree = merkleHelper.createTree([messageId1, messageId2])
      const rootBytes = tree.getRoot()
      const root = setup.createMerkleRoot(1n, 2n, rootBytes)

      await setup.setupOCRConfigs()
      await setup.commitReport([root])

      // Get proof for message2 but try to execute message1 (wrong proof)
      const proof = tree.prove([1])
      let proofFlagBits = 0n
      for (let i = 0; i < proof.sourceFlags.length; i++) {
        if (proof.sourceFlags[i]) {
          proofFlagBits |= 1n << BigInt(i)
        }
      }

      // Try to execute first message with wrong proof (proof for message2)
      const report = of.ExecutionReport.create({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        messages: asSnakedCell([message1], (msg) =>
          (() => {
            const b = beginCell()
            of.Any2TVMRampMessage.store(msg, b)
            return b
          })(),
        ),
        offchainTokenData: Cell.EMPTY,
        proofs: proof.hashes,
        proofFlagBits,
      })

      const result = await setup.offRamp.sendOffRampExecute(
        setup.transmitters[0].getSender(),
        toNano('0.5'),
        {
          reportContext: of.ReportContext.create({
            configDigest: setup.configDigest,
            sequenceBytes: 0x02n,
          }),
          report,
        },
      )

      // The execute call itself should succeed but message verification should fail
      expect(result.transactions).toHaveTransaction({
        from: setup.transmitters[0].address,
        to: setup.offRamp.address,
        success: true,
      })

      // Should have a failed transaction (proof verification failure)
      expect(result.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        success: false,
      })

      // Message should not reach the receiver
      expect(result.transactions).not.toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
      })
    })

    it('Test commit three messages in one root and execute middle message with proof', async () => {
      const message1 = setup.createTestMessage(1n, 1n, setup.receiver.address)
      const message2 = setup.createTestMessage(2n, 2n, setup.receiver.address)
      const message3 = setup.createTestMessage(3n, 3n, setup.receiver.address)
      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )

      // Generate message IDs
      const messageId1 = generateMessageID(message1, metadataHash)
      const messageId2 = generateMessageID(message2, metadataHash)
      const messageId3 = generateMessageID(message3, metadataHash)

      // Create merkle tree with all three messages
      const merkleHelper = new MerkleHelper()

      const { proof, root: rootBytes } = merkleHelper.createTreeAndProve(
        [messageId1, messageId2, messageId3],
        [1],
      )

      const root = setup.createMerkleRoot(1n, 3n, rootBytes)

      await setup.setupOCRConfigs()
      await setup.commitReport([root])

      // Convert proof to proofFlagBits format
      let proofFlagBits = 0n
      for (let i = 0; i < proof.sourceFlags.length; i++) {
        if (proof.sourceFlags[i]) {
          proofFlagBits |= 1n << BigInt(i)
        }
      }

      // Execute middle message with proof
      const report = of.ExecutionReport.create({
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        messages: asSnakedCell([message2], (msg) =>
          (() => {
            const b = beginCell()
            of.Any2TVMRampMessage.store(msg, b)
            return b
          })(),
        ),
        offchainTokenData: Cell.EMPTY,
        proofs: proof.hashes,
        proofFlagBits,
      })

      const result = await setup.executeReport(report)

      // Middle message should be successfully processed
      expect(result.transactions).toHaveTransaction({
        from: setup.router.address,
        to: setup.receiver.address,
        success: true,
      })

      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          sequenceNumber: 2n,
          messageId: 2n,
          state: of.ExecutionState.Success,
        },
      )
    })

    it('Test commit five messages in one root and execute each individually with proofs', async () => {
      // Create 5 messages
      const messages = [
        setup.createTestMessage(1n, 1n, setup.receiver.address),
        setup.createTestMessage(2n, 2n, setup.receiver.address),
        setup.createTestMessage(3n, 3n, setup.receiver.address),
        setup.createTestMessage(4n, 4n, setup.receiver.address),
        setup.createTestMessage(5n, 5n, setup.receiver.address),
      ]

      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )

      // Generate message IDs for all messages
      const messageIds = messages.map((msg) => generateMessageID(msg, metadataHash))

      // Create merkle tree with all five messages
      const merkleHelper = new MerkleHelper()

      const tree = merkleHelper.createTree(messageIds)
      const rootBytes = tree.getRoot()
      const root = setup.createMerkleRoot(1n, 5n, rootBytes)

      await setup.setupOCRConfigs()
      await setup.commitReport([root])

      // Execute each message individually with its proof
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i]
        const proof = tree.prove([i])

        // Convert proof to proofFlagBits format
        let proofFlagBits = 0n
        for (let j = 0; j < proof.sourceFlags.length; j++) {
          if (proof.sourceFlags[j]) {
            proofFlagBits |= 1n << BigInt(j)
          }
        }

        const report = of.ExecutionReport.create({
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          messages: asSnakedCell([message], (msg) =>
            (() => {
              const b = beginCell()
              of.Any2TVMRampMessage.store(msg, b)
              return b
            })(),
          ),
          offchainTokenData: Cell.EMPTY,
          proofs: proof.hashes,
          proofFlagBits,
        })

        const result = await setup.executeReport(report)

        // Each message should be successfully processed
        expect(result.transactions).toHaveTransaction({
          from: setup.router.address,
          to: setup.receiver.address,
          success: true,
        })

        assertLog(
          result.transactions,
          setup.offRamp.address,
          CCIPLogs.LogTypes.ExecutionStateChanged,
          {
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            sequenceNumber: BigInt(i + 1),
            messageId: BigInt(i + 1),
            state: of.ExecutionState.Success,
          },
        )
      }
    })

    it('Test commit five messages and execute them in non-sequential order', async () => {
      // Create 5 messages
      const messages = [
        setup.createTestMessage(1n, 1n, setup.receiver.address),
        setup.createTestMessage(2n, 2n, setup.receiver.address),
        setup.createTestMessage(3n, 3n, setup.receiver.address),
        setup.createTestMessage(4n, 4n, setup.receiver.address),
        setup.createTestMessage(5n, 5n, setup.receiver.address),
      ]

      const metadataHash = s.getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )

      // Generate message IDs for all messages
      const messageIds = messages.map((msg) => generateMessageID(msg, metadataHash))

      // Create merkle tree with all five messages
      const merkleHelper = new MerkleHelper()

      const tree = merkleHelper.createTree(messageIds)
      const rootBytes = tree.getRoot()
      const root = setup.createMerkleRoot(1n, 5n, rootBytes)

      await setup.setupOCRConfigs()
      await setup.commitReport([root])

      // Execute messages in non-sequential order: 3rd, 1st, 5th, 2nd, 4th
      const executionOrder = [2, 0, 4, 1, 3]

      for (const index of executionOrder) {
        const message = messages[index]
        const proof = tree.prove([index])

        // Convert proof to proofFlagBits format
        let proofFlagBits = 0n
        for (let j = 0; j < proof.sourceFlags.length; j++) {
          if (proof.sourceFlags[j]) {
            proofFlagBits |= 1n << BigInt(j)
          }
        }

        const report = of.ExecutionReport.create({
          sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          messages: asSnakedCell([message], (msg) =>
            (() => {
              const b = beginCell()
              of.Any2TVMRampMessage.store(msg, b)
              return b
            })(),
          ),
          offchainTokenData: Cell.EMPTY,
          proofs: proof.hashes,
          proofFlagBits,
        })

        const result = await setup.executeReport(report)

        // Each message should be successfully processed
        expect(result.transactions).toHaveTransaction({
          from: setup.router.address,
          to: setup.receiver.address,
          success: true,
        })

        assertLog(
          result.transactions,
          setup.offRamp.address,
          CCIPLogs.LogTypes.ExecutionStateChanged,
          {
            sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
            sequenceNumber: BigInt(index + 1),
            messageId: BigInt(index + 1),
            state: of.ExecutionState.Success,
          },
        )
      }
    })
  })

  describe('Token transfer execution', () => {
    let setup: OffRampWithTokenPoolTestSetup

    beforeAll(async () => {
      setup = await s.OffRampWithTokenPoolTestSetup.Init(blockchain)
    })

    beforeEach(async () => {
      await setup.SetupContracts()
    }, 60000) // setup can take a while, since we deploy contracts

    it('executes a token transfer end to end', async () => {
      const message = setup.createTestMessageWithToken()

      await setup.setupAndCommitMessage(message)
      const report = setup.createExecuteReport([message])
      const result = await setup.executeReport(report)

      // 1. OffRamp -> ReceiveExecutor (deploy + InitExecute)
      const executorAddress = setup.receiveExecutorAddress(message)
      expect(result.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        to: executorAddress,
        deploy: true,
        success: true,
      })

      // 2. ReceiveExecutor -> TokenRegistry (GetTokenInfo) and back
      const registryAddress = setup.tokenRegistryAddress()
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: registryAddress,
        op: trg.TokenRegistry_GetTokenInfo.PREFIX,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: registryAddress,
        to: executorAddress,
        op: trg.TokenRegistry_ReturnTokenInfo.PREFIX,
        success: true,
      })

      // 3. ReceiveExecutor -> OffRamp (ReleaseOrMint) -> TokenPool
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: setup.offRamp.address,
        op: of.OffRamp_ReleaseOrMint.PREFIX,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        to: setup.tokenPool.address,
        op: tp.TokenPool_ReleaseOrMint.PREFIX,
        success: true,
      })

      // 4. TokenPool -> ReceiveExecutor (ReleaseOrMintFinished)
      expect(result.transactions).toHaveTransaction({
        from: setup.tokenPool.address,
        to: executorAddress,
        op: tp.TokenPool_ReleaseOrMintFinished.PREFIX,
        success: true,
      })

      // 5. ReceiveExecutor -> OffRamp (NotifySuccess) -> MerkleRoot (MarkState)
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        to: setup.offRamp.address,
        op: of.OffRamp_NotifySuccess.PREFIX,
        success: true,
      })

      // 6. ExecutionStateChanged: InProgress -> Success
      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: setup.SOURCE_CHAIN_SELECTOR,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.InProgress,
        },
      )
      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: setup.SOURCE_CHAIN_SELECTOR,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Success,
        },
      )

      // TODO after we connect to a real token pool
      // expect(await setup.getTokenBalance()).toEqual(setup.DEFAULT_TOKEN_AMOUNT)
    })

    it('executes a token transfer to a non-contract receiver', async () => {
      const stranger = generateMockTonAddress()
      const message = setup.createTestMessageWithToken()

      await setup.setupAndCommitMessage(message)
      const report = setup.createExecuteReport([message])
      const result = await setup.executeReport(report)

      // Token transfer should still complete and notify success.
      expect(result.transactions).toHaveTransaction({
        from: setup.offRamp.address,
        to: setup.tokenPool.address,
        op: tp.TokenPool_ReleaseOrMint.PREFIX,
        success: true,
      })

      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: setup.SOURCE_CHAIN_SELECTOR,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Success,
        },
      )

      // TODO after we connect to a real token pool
      // expect(await setup.getTokenBalance()).toEqual(setup.DEFAULT_TOKEN_AMOUNT)
    })

    // TODO extraData with different decimals and some out of range and invalid data

    it('fails when the token is not enabled in the TokenRegistry', async () => {
      await setup.disableToken()

      const message = setup.createTestMessageWithToken()

      await setup.setupAndCommitMessage(message)
      const report = setup.createExecuteReport([message])
      const result = await setup.executeReport(report)

      // The registry returns tokenPool = null, so the ReceiveExecutor should
      // fail (bounce) and the message should end in FAILURE state.
      const executorAddress = setup.receiveExecutorAddress(message)
      expect(result.transactions).toHaveTransaction({
        from: executorAddress,
        success: true,
        op: of.OffRamp_NotifyFailure.PREFIX,
      })

      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: setup.SOURCE_CHAIN_SELECTOR,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Failure,
        },
      )
    })

    it('fails when the message has more than one token transfer', async () => {
      const message = setup.createTestMessageWithToken()
      // Add a second token transfer.
      message.tokenAmounts!.push(
        of.Any2TVMTokenTransfer.create({
          sourcePoolAddress: beginCell().storeBuffer(Buffer.from('source-pool-2')).asSlice(),
          token: generateMockTonAddress(),
          destGasAmount: 0n,
          extraData: Cell.EMPTY,
          amount: setup.DEFAULT_TOKEN_AMOUNT,
        }),
      )

      await setup.setupAndCommitMessage(message)
      const report = setup.createExecuteReport([message])
      const result = await setup.executeReport(report)

      // The OffRamp should reject the message with UnsupportedNumberOfTokens
      // when deriving the token admin registry.

      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: setup.SOURCE_CHAIN_SELECTOR,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Failure,
        },
      )
    })

    // TODO these failure paths require a fix in TokenPool flow
    // Instead of reverting, the TokenPool should send a failure message back
    // to the ReceiveExecutor, which should then notify failure to the OffRamp.

    it.skip('fails when the token pool rejects the releaseOrMint (rate limit)', async () => {
      // Rate limit capacity is 0, so the releaseOrMint will be rejected.
      await setup.updateRateLimit(0n, 0n)

      const message = setup.createTestMessageWithToken()

      await setup.setupAndCommitMessage(message)
      const report = setup.createExecuteReport([message])
      const result = await setup.executeReport(report)

      // The token pool should reject the releaseOrMint (rate limit exceeded).
      expect(result.transactions).toHaveTransaction({
        from: setup.tokenPool.address,
        op: tp.TokenPool_ReleaseOrMintFailure.PREFIX,
        success: true,
      })

      // The ReceiveExecutor should notify failure and the message ends in FAILURE.
      assertLog(
        result.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: setup.SOURCE_CHAIN_SELECTOR,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Failure,
        },
      )
    })

    it.skip('manual execute retries releaseOrMint after a token pool failure', async () => {
      // initial rate limit of 0 so the first releaseOrMint fails
      await setup.updateRateLimit(0n, 0n)

      const message = setup.createTestMessageWithToken()

      await setup.setupAndCommitMessage(message)
      const report = setup.createExecuteReport([message])

      // First execution fails due to rate limit.
      const firstResult = await setup.executeReport(report)
      expect(firstResult.transactions).toHaveTransaction({
        from: setup.tokenPool.address,
        op: tp.TokenPool_ReleaseOrMintFailure.PREFIX,
      })
      assertLog(
        firstResult.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: setup.SOURCE_CHAIN_SELECTOR,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Failure,
        },
      )

      // Increase the rate limit so the retry succeeds.
      await setup.updateRateLimit(
        setup.DEFAULT_TOKEN_AMOUNT * 10n,
        setup.DEFAULT_TOKEN_AMOUNT * 10n,
      )

      // Manual execute should retry the releaseOrMint and succeed.
      const manualResult = await setup.manualExecuteReport(report, undefined, true)
      expect(manualResult.transactions).toHaveTransaction({
        from: setup.tokenPool.address,
        op: tp.TokenPool_ReleaseOrMintFinished.PREFIX,
        success: true,
      })
      assertLog(
        manualResult.transactions,
        setup.offRamp.address,
        CCIPLogs.LogTypes.ExecutionStateChanged,
        {
          sourceChainSelector: setup.SOURCE_CHAIN_SELECTOR,
          sequenceNumber: 1n,
          messageId: 1n,
          state: of.ExecutionState.Success,
        },
      )

      // TODO after we connect to a real token pool
      // expect(await setup.getTokenBalance()).toEqual(setup.DEFAULT_TOKEN_AMOUNT)
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

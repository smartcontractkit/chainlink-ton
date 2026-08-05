import { Cell, toNano, beginCell } from '@ton/core'
import { Blockchain } from '@ton/sandbox'
import { crc32 } from 'zlib'

import {
  generateMockTonAddress,
  bigIntToBuffer,
  asSnakedCell,
  generateRandomContractId,
} from '../../../src/utils'
import * as coverage from '../../coverage/coverage'
import { MerkleHelper } from '../../lib/merkle_proof/helpers/MerkleMultiProofHelper'
import { expectSuccessfulTransaction, assertLog, expectFailedTransaction } from '../../Logs'
import { ChainSelectors } from '../../utils/Selectors'
import generateMessageID from '../../../src/offramp/generateMessageID'

import { contractCode } from '../../../wrappers/codeLoader'
import * as ocr from '../../../wrappers/libraries/ocr/MultiOCR3Base'
import { facilityId, errorCode } from '../../../wrappers/utils'

import * as mr from '../../../wrappers/gen/ccip/MerkleRoot'
import * as rx from '../../../wrappers/gen/ccip/ReceiveExecutor'
import * as tr from '../../../wrappers/examples/Receiver'
import * as of from '../../../wrappers/gen/ccip/OffRamp'

import * as CCIPLogs from '../../../wrappers/ccip/Logs'
import * as ofManual from '../../../wrappers/ccip/OffRamp'
import { RMNREMOTE_GLOBAL_CURSE_SUBJECT } from '../../../wrappers/ccip/Router'

import {
  createSignatures,
  OffRampTestSetup,
  getDefaultMetadataHash,
  buildCursedSubjects,
  EVM_ONRAMP_ADDRESS_TEST,
  generateMerkleRootBytes,
} from './OffRamp.Setup'

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

  it('should deploy', async () => {
    // the check is done inside beforeEach
    // blockchain and counter are ready to use
  })

  it('should handle two OCR3 configs', async () => {
    await setup.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)
    await setup.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
  })

  describe('OCR3 Config Validation Tests', () => {
    it('should reject commit plugin config without signature verification', async () => {
      const result = await setup.offRamp.sendOCR3BaseSetOCR3Config(
        setup.deployer.getSender(),
        ...setup.createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
          isSignatureVerificationEnabled: false, // Invalid for commit
        }),
      )

      expectFailedTransaction(
        result,
        setup.deployer.address,
        setup.offRamp.address,
        of.OffRamp.Errors['Error.SignatureVerificationRequiredInCommitPlugin'],
      )
    })

    it('should reject execute plugin config with signature verification', async () => {
      const result = await setup.offRamp.sendOCR3BaseSetOCR3Config(
        setup.deployer.getSender(),
        ...setup.createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_EXECUTE,
          isSignatureVerificationEnabled: true, // Invalid for execute
          signers: setup.signersPublicKeys,
        }),
      )

      expectFailedTransaction(
        result,
        setup.deployer.address,
        setup.offRamp.address,
        of.OffRamp.Errors['Error.SignatureVerificationNotAllowedInExecutionPlugin'],
      )
    })

    it('should accept commit plugin config with signature verification enabled', async () => {
      const result = await setup.offRamp.sendOCR3BaseSetOCR3Config(
        setup.deployer.getSender(),
        ...setup.createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
          isSignatureVerificationEnabled: true, // Valid
        }),
      )

      expectSuccessfulTransaction(result, setup.deployer.address, setup.offRamp.address)
    })

    it('should accept execute plugin config without signature verification', async () => {
      const result = await setup.offRamp.sendOCR3BaseSetOCR3Config(
        setup.deployer.getSender(),
        ...setup.createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_EXECUTE,
          isSignatureVerificationEnabled: false, // Valid
          signers: [],
        }),
      )

      expectSuccessfulTransaction(result, setup.deployer.address, setup.offRamp.address)
    })

    it('should reset latestPriceSequenceNumber when commit config changes', async () => {
      // First, set initial commit config and update price sequence number
      await setup.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)

      const sourceToken = generateMockTonAddress()
      const priceUpdates = of.PriceUpdates.create({
        tokenPriceUpdates: [of.TokenPriceUpdate.create({ sourceToken, usdPerToken: 100n })],
        gasPriceUpdates: [],
      })

      // Commit with sequence 0x10
      await setup.commitReport([], toNano('0.5'), 0x10, priceUpdates)
      let latestSeq = await setup.offRamp.getLatestPriceSequenceNumber()
      expect(latestSeq).toBe(0x10n)

      // Change commit config (new config digest)
      const newConfigDigest = 0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789n
      const result = await setup.offRamp.sendOCR3BaseSetOCR3Config(
        setup.deployer.getSender(),
        ...setup.createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
          configDigest: newConfigDigest,
        }),
      )
      expectSuccessfulTransaction(result, setup.deployer.address, setup.offRamp.address)

      // Price sequence number should be reset to 0
      latestSeq = await setup.offRamp.getLatestPriceSequenceNumber()
      expect(latestSeq).toBe(0n)
    })

    it('should not reset latestPriceSequenceNumber when execute config changes', async () => {
      // Setup both configs and set price sequence
      await setup.setupOCRConfigs()

      const sourceToken = generateMockTonAddress()
      const priceUpdates = of.PriceUpdates.create({
        tokenPriceUpdates: [of.TokenPriceUpdate.create({ sourceToken, usdPerToken: 100n })],
        gasPriceUpdates: [],
      })

      await setup.commitReport([], toNano('0.5'), 0x10, priceUpdates)
      let latestSeq = await setup.offRamp.getLatestPriceSequenceNumber()
      expect(latestSeq).toBe(0x10n)

      // Change execute config (not commit)
      const newConfigDigest = 0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789n
      const result = await setup.offRamp.sendOCR3BaseSetOCR3Config(
        setup.deployer.getSender(),
        ...setup.createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_EXECUTE,
          configDigest: newConfigDigest,
          isSignatureVerificationEnabled: false,
          signers: [],
        }),
      )
      expectSuccessfulTransaction(result, setup.deployer.address, setup.offRamp.address)

      // Price sequence number should remain unchanged
      latestSeq = await setup.offRamp.getLatestPriceSequenceNumber()
      expect(latestSeq).toBe(0x10n)
    })
  })

  it('Test commit report fails with completely empty report (no merkle roots and no price updates)', async () => {
    await setup.setupOCRConfig()

    // Create a commit report with empty merkleRoots and undefined priceUpdates
    const report = of.CommitReport.create({
      merkleRoots: [],
    })
    const reportContext: ocr.ReportContext = {
      configDigest: setup.configDigest,
      padding: 0n,
      sequenceBytes: 0x01,
    }
    const signatures = createSignatures(
      [setup.signers[0], setup.signers[1]],
      ocr.hashReport(of.CommitReport.toCell(report), reportContext),
    )

    const result = await setup.offRamp.sendOffRampCommit(
      setup.transmitters[0].getSender(),
      toNano('0.5'),
      {
        reportContext: of.ReportContext.create({
          configDigest: setup.configDigest,
          sequenceBytes: 1n,
        }),
        report,
        signatures,
      },
    )

    expectFailedTransaction(
      result,
      setup.transmitters[0].address,
      setup.offRamp.address,
      of.OffRamp.Errors['Error.EmptyCommitReport'],
    )
  })

  it('Test commit fails when source chain is cursed', async () => {
    const message = setup.createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = setup.createMerkleRoot(1n, 1n, rootBytes)

    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    // Curse source chain
    const curseResult = await setup.offRamp.sendOffRampUpdateCursedSubjects(
      setup.deployer.getSender(),
      toNano('0.5'),
      {
        cursedSubjects: buildCursedSubjects(
          new Set([ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001]),
        ),
      },
    )
    expect(curseResult.transactions).toHaveTransaction({
      from: setup.deployer.address,
      to: setup.offRamp.address,
      success: true,
    })
    let cursedSubjects = await setup.offRamp.getCursedSubjects()
    expect(cursedSubjects).toEqual([ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001])

    // Attempt to commit - should fail with SubjectCursed
    await setup.commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.SubjectCursed'],
    )

    // Uncurse source chain
    const uncurseResult = await setup.offRamp.sendOffRampUpdateCursedSubjects(
      setup.deployer.getSender(),
      toNano('0.5'),
      {
        cursedSubjects: of.CursedSubjects.create({ data: new Set([]) }),
      },
    )
    expect(uncurseResult.transactions).toHaveTransaction({
      from: setup.deployer.address,
      to: setup.offRamp.address,
      success: true,
    })
    cursedSubjects = await setup.offRamp.getCursedSubjects()
    expect(cursedSubjects).toEqual([])

    // Now commit should succeed
    await setup.commitReport([root], toNano('0.5'), 0x02, undefined)
  })

  it('Test commit fails when global cursed', async () => {
    const message = setup.createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = setup.createMerkleRoot(1n, 1n, rootBytes)

    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    // Curse all lanes
    const curseResult = await setup.offRamp.sendOffRampUpdateCursedSubjects(
      setup.deployer.getSender(),
      toNano('0.5'),
      {
        cursedSubjects: of.CursedSubjects.create({
          data: new Set([RMNREMOTE_GLOBAL_CURSE_SUBJECT]),
        }),
      },
    )
    expect(curseResult.transactions).toHaveTransaction({
      from: setup.deployer.address,
      to: setup.offRamp.address,
      success: true,
    })
    let cursedSubjects = await setup.offRamp.getCursedSubjects()
    expect(cursedSubjects).toEqual([RMNREMOTE_GLOBAL_CURSE_SUBJECT])

    // Attempt to commit - should fail with SubjectCursed
    await setup.commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.SubjectCursed'],
    )

    // Uncurse all lanes
    const uncurseResult = await setup.offRamp.sendOffRampUpdateCursedSubjects(
      setup.deployer.getSender(),
      toNano('0.5'),
      {
        cursedSubjects: of.CursedSubjects.create({ data: new Set([]) }),
      },
    )
    expect(uncurseResult.transactions).toHaveTransaction({
      from: setup.deployer.address,
      to: setup.offRamp.address,
      success: true,
    })
    cursedSubjects = await setup.offRamp.getCursedSubjects()
    expect(cursedSubjects).toEqual([])

    // Now commit should succeed
    await setup.commitReport([root], toNano('0.5'), 0x02, undefined)
  })

  it('Test commit fails with onRamp address mismatch', async () => {
    const message = setup.createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)

    // Create root with wrong onRamp address
    const wrongOnRampAddress = 0x222222c891c5d4e6ad68064ae45d43146d4f9f3an
    const root: of.MerkleRoot = {
      $: 'MerkleRoot',
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      onRampAddress: beginCell().storeBuffer(bigIntToBuffer(wrongOnRampAddress)).asSlice(),
      minSeqNr: 1n,
      maxSeqNr: 1n,
      merkleRoot: rootBytes,
    }

    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    await setup.commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.OnRampAddressMismatch'],
    )
  })

  it('Test commit fails with zero merkle root', async () => {
    const root = setup.createMerkleRoot(1n, 1n, 0n) // merkleRoot is 0

    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    await setup.commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.MerkleRootCannotBeZero'],
    )
  })

  it('Test commit with one merkle root for one empty message', async () => {
    const message = setup.createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = setup.createMerkleRoot(1n, 1n, rootBytes)

    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    const result = await setup.commitReport([root])

    expect(result.transactions).toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.merkleRootAddress(root),
      deploy: true,
      success: true,
    })
  })

  it('Test commit report fails if more than one merkle root', async () => {
    const message = setup.createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root1 = setup.createMerkleRoot(1n, 1n, rootBytes)
    const root2 = setup.createMerkleRoot(2n, 2n, rootBytes)

    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    await setup.commitReport(
      [root1, root2],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.BatchingNotSupported'],
    )
  })

  it('Test commit report fails if source chain is not enabled', async () => {
    const message = setup.createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = setup.createMerkleRoot(1n, 1n, rootBytes)

    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig({ isEnabled: false }) // disabled source chain

    const report = of.CommitReport.create({
      merkleRoots: [root],
    })
    const reportContext: ocr.ReportContext = {
      configDigest: setup.configDigest,
      padding: 0n,
      sequenceBytes: 0x01,
    }
    const signatures = createSignatures(
      [setup.signers[0], setup.signers[1]],
      ocr.hashReport(of.CommitReport.toCell(report), reportContext),
    )

    const result = await setup.offRamp.sendOffRampCommit(
      setup.transmitters[0].getSender(),
      toNano('0.5'),
      {
        reportContext: of.ReportContext.create({
          configDigest: setup.configDigest,
          sequenceBytes: 1n,
        }),
        report,
        signatures,
      },
    )

    expectFailedTransaction(
      result,
      setup.transmitters[0].address,
      setup.offRamp.address,
      of.OffRamp.Errors['Error.SourceChainNotEnabled'],
    )
  })

  it('Test commit with more than 64 messages fails', async () => {
    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    const message = setup.createTestMessage(1n, 1n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)

    // Commit with more than 64 messages should fail
    const root = setup.createMerkleRoot(1n, 65n, rootBytes)

    await setup.commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.TooManyMessagesInReport'],
    )

    // Commit with exactly 64 messages should succeed
    const root2 = setup.createMerkleRoot(1n, 64n, rootBytes)
    await setup.commitReport([root2], toNano('0.5'), 0x02, undefined)
  })

  it('Test commit with two merkle roots with one message each', async () => {
    const message1 = setup.createTestMessage(1n, 1n)
    const message2 = setup.createTestMessage(2n, 2n)

    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const root1Bytes = generateMessageID(message1, metadataHash)
    const root2Bytes = generateMessageID(message2, metadataHash)

    const root1 = setup.createMerkleRoot(1n, 1n, root1Bytes)
    const root2 = setup.createMerkleRoot(2n, 2n, root2Bytes)

    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    const result1 = await setup.commitReport([root1])

    expect(result1.transactions).toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.merkleRootAddress(root1),
      deploy: true,
      success: true,
    })

    const result2 = await setup.commitReport([root2])
    expect(result2.transactions).toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.merkleRootAddress(root2),
      deploy: true,
      success: true,
    })
  })

  it('Test execute fails when root was not committed', async () => {
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

  it('Test execute fails when different root was committed', async () => {
    const message = setup.createTestMessage(2n, 2n, setup.receiver.address)
    const differentMessage = setup.createTestMessage(1n, 1n, setup.receiver.address)

    const metadataHash = getDefaultMetadataHash(
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

  it('Test execute fails when same message is sent twice', async () => {
    const message = setup.createTestMessage(1n, 1n, setup.receiver.address)
    const metadataHash = getDefaultMetadataHash(
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

  it('Test execute fails with empty report', async () => {
    await setup.setupOCRConfigs()
    const report = setup.createExecuteReport([])
    await setup.executeReportExpectingFailure(
      report,
      of.OffRamp.Errors['Error.EmptyExecutionReport'],
    )
  })

  it('Test execute fails when message destChainSelector is wrong', async () => {
    const wrongDestMessage = setup.createTestMessage(1n, 1n, setup.receiver.address)
    wrongDestMessage.header.destChainSelector = 999999n

    await setup.setupAndCommitMessage(wrongDestMessage)
    const report = setup.createExecuteReport([wrongDestMessage])
    await setup.executeReportExpectingFailure(
      report,
      of.OffRamp.Errors['Error.InvalidMessageDestChainSelector'],
    )
  })

  it('Test execute fails when message sourceChainSelector mismatches report', async () => {
    const wrongSourceMessage = setup.createTestMessage(1n, 1n, setup.receiver.address)
    wrongSourceMessage.header.sourceChainSelector = 888888n

    await setup.setupAndCommitMessage(wrongSourceMessage)
    const report = setup.createExecuteReport(
      [wrongSourceMessage],
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    ) // Different from message
    await setup.executeReportExpectingFailure(
      report,
      of.OffRamp.Errors['Error.SourceChainSelectorMismatch'],
    )
  })

  it('Test execute fails when source chain is disabled', async () => {
    const message = setup.createTestMessage(1n, 1n, setup.receiver.address)

    // Setup and commit with enabled chain
    await setup.setupOCRConfigs()
    const metadataHash = getDefaultMetadataHash(
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
      of.OffRamp.Errors['Error.SourceChainNotEnabled'],
    )
  })

  it('Test execute fails when source chain is cursed', async () => {
    const message = setup.createTestMessage(1n, 1n, setup.receiver.address)

    // Setup and commit with enabled chain
    await setup.setupOCRConfigs()
    const metadataHash = getDefaultMetadataHash(
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
        cursedSubjects: buildCursedSubjects(
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
    await setup.executeReportExpectingFailure(report, of.OffRamp.Errors['Error.SubjectCursed'])

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

  it('Test execute fails when source chain is globally cursed', async () => {
    const message = setup.createTestMessage(1n, 1n, setup.receiver.address)

    // Setup and commit with enabled chain
    await setup.setupOCRConfigs()
    const metadataHash = getDefaultMetadataHash(
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
    await setup.executeReportExpectingFailure(report, of.OffRamp.Errors['Error.SubjectCursed'])

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

  it('Test execute fails when source chain config does not exist', async () => {
    const unknownChainSelector = 777777n
    const message = setup.createTestMessage(1n, 1n, setup.receiver.address)
    message.header.sourceChainSelector = unknownChainSelector

    await setup.setupOCRConfigs()
    const report = setup.createExecuteReport([message], unknownChainSelector)
    await setup.executeReportExpectingFailure(
      report,
      of.OffRamp.Errors['Error.SourceChainNotEnabled'],
    )
  })

  it('Test execute succeeds with valid message and proof', async () => {
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
    assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      messageId: message.header.messageId,
      state: of.ExecutionState.InProgress,
    })
    assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      messageId: message.header.messageId,
      state: of.ExecutionState.Success,
    })
  })

  it('Test execute fails with valid message and proof but low gaslimit', async () => {
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

    assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      messageId: message.header.messageId,
      state: of.ExecutionState.InProgress,
    })
    assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      messageId: message.header.messageId,
      state: of.ExecutionState.Failure,
    })
  })

  it('Test cannot call dispatch directly', async () => {
    const message = setup.createTestMessage(1n, 1n, setup.receiver.address)
    const metadataHash = getDefaultMetadataHash(
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
      exitCode: of.OffRamp.Errors['Error.MessageNotFromOwnedContract'],
    })
  })

  it('Can commit with no roots and only price updates', async () => {
    await setup.setupOCRConfig()
    const sourceToken = generateMockTonAddress()
    const priceUpdates = of.PriceUpdates.create({
      tokenPriceUpdates: [
        of.TokenPriceUpdate.create({
          sourceToken,
          usdPerToken: 1n,
        }),
      ],
      gasPriceUpdates: [
        of.GasPriceUpdate.create({
          destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          executionGasPrice: 1n,
          dataAvailabilityGasPrice: 1n,
        }),
      ],
    })
    const result = await setup.commitReport([], toNano('0.5'), 0x01, priceUpdates)
    expect(result.transactions).toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: setup.feeQuoter.address,
      to: setup.transmitters[0].address,
      success: true,
    })
  })

  it('Can commit with both merkle root and price updates', async () => {
    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    // Create a merkle root
    const message = setup.createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = setup.createMerkleRoot(1n, 1n, rootBytes)

    // Create price updates
    const sourceToken = generateMockTonAddress()
    const priceUpdates = of.PriceUpdates.create({
      tokenPriceUpdates: [
        of.TokenPriceUpdate.create({
          sourceToken,
          usdPerToken: 1n,
        }),
      ],
      gasPriceUpdates: [
        of.GasPriceUpdate.create({
          destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          executionGasPrice: 1n,
          dataAvailabilityGasPrice: 1n,
        }),
      ],
    })

    const result = await setup.commitReport([root], toNano('0.5'), 0x01, priceUpdates)
  })

  it('Test price update sequence number increases with OCR sequence', async () => {
    await setup.setupOCRConfig()

    const sourceToken = generateMockTonAddress()
    const priceUpdates = of.PriceUpdates.create({
      tokenPriceUpdates: [
        of.TokenPriceUpdate.create({
          sourceToken,
          usdPerToken: 100n,
        }),
      ],
      gasPriceUpdates: [],
    })

    // First commit with sequence 0x01
    await setup.commitReport([], toNano('0.5'), 0x01, priceUpdates)
    let latestSeq = await setup.offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x01n)

    // Second commit with sequence 0x05 (jump forward)
    await setup.commitReport([], toNano('0.5'), 0x05, priceUpdates)
    latestSeq = await setup.offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x05n)

    // Third commit with higher sequence 0x10
    await setup.commitReport([], toNano('0.5'), 0x10, priceUpdates)
    latestSeq = await setup.offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x10n)
  })

  it('Test stale price updates are rejected', async () => {
    await setup.setupOCRConfig()

    const sourceToken = generateMockTonAddress()
    const priceUpdates = of.PriceUpdates.create({
      tokenPriceUpdates: [
        of.TokenPriceUpdate.create({
          sourceToken,
          usdPerToken: 100n,
        }),
      ],
      gasPriceUpdates: [],
    })

    // First commit with sequence 0x10
    await setup.commitReport([], toNano('0.5'), 0x10, priceUpdates)
    let latestSeq = await setup.offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x10n)

    // Try to commit with older sequence 0x05 (should be ignored)
    await setup.commitReport([], toNano('0.5'), 0x05, priceUpdates)
    latestSeq = await setup.offRamp.getLatestPriceSequenceNumber()
    // Sequence should remain at 0x10, stale update ignored
    expect(latestSeq).toBe(0x10n)

    // But commit with same merkle root should succeed (just price update ignored)
    const message = setup.createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = setup.createMerkleRoot(1n, 1n, rootBytes)

    await setup.setupSourceChainConfig()
    await setup.commitReport([root], toNano('0.5'), 0x08, priceUpdates) // 0x08 < 0x10, price update should be ignored
    latestSeq = await setup.offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x10n) // Still at 0x10, but merkle root was committed
  })

  it('Test source chain minSeqNr updates correctly to maxSeqNr + 1', async () => {
    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    // First commit with minSeqNr=1, maxSeqNr=5
    const message1 = setup.createTestMessage(1n, 1n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const root1Bytes = generateMessageID(message1, metadataHash)
    const root1 = setup.createMerkleRoot(1n, 5n, root1Bytes) // maxSeqNr = 5

    await setup.commitReport([root1])

    // Check that minSeqNr is now 6 (maxSeqNr + 1)
    const config1 = await setup.offRamp.getSourceChainConfig(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    expect(config1.minSeqNr).toBe(6n)

    // Second commit with minSeqNr=6, maxSeqNr=10
    const message2 = setup.createTestMessage(6n, 6n)
    const root2Bytes = generateMessageID(message2, metadataHash)
    const root2 = setup.createMerkleRoot(6n, 10n, root2Bytes) // maxSeqNr = 10

    await setup.commitReport([root2])

    // Check that minSeqNr is now 11 (maxSeqNr + 1)
    const config2 = await setup.offRamp.getSourceChainConfig(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    expect(config2.minSeqNr).toBe(11n)
    // onRamp is a Slice (CrossChainAddress) - the raw bytes without length prefix
    expect(config2.onRamp.toString()).toBe(EVM_ONRAMP_ADDRESS_TEST.toString())
  })

  it('Test commit with large sequence number gap', async () => {
    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    // Commit with a large gap: minSeqNr=1, maxSeqNr=100
    const message = setup.createTestMessage(1n, 1n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = setup.createMerkleRoot(1n, 10n, rootBytes)

    const value = toNano('1')
    await setup.commitReport([root], value)

    // minSeqNr should jump to 101
    const config = await setup.offRamp.getSourceChainConfig(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    expect(config.minSeqNr).toBe(11n)
  })

  it('Test receiver notifies success with non-empty data and offRamp emits ExecutionStateChanged: Success', async () => {
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

    assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.InProgress,
    })

    assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.Success,
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
  })

  it('Test receiver notifies success with empty data and offRamp emits ExecutionStateChanged: Success', async () => {
    const message = setup.createTestMessage(1n, 1n, setup.receiver.address) // empty data (Cell.EMPTY)
    await setup.setupAndCommitMessage(message)
    const report = setup.createExecuteReport([message])
    const result = await setup.executeReport(report)

    expect(result.transactions).toHaveTransaction({
      from: setup.router.address,
      to: setup.receiver.address,
      success: true,
    })

    assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.InProgress,
    })

    assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.Success,
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
  })

  it('Test receiver rejects message from wrong offRamp and emits ExecutionStateChanged: Failure', async () => {
    // Deploy a receiver with WRONG offRamp address - it will reject messages from the real offRamp
    let code = await contractCode.ccip.local('ccip.test.receiver')
    const wrongRouterAddress = generateMockTonAddress() // Use a different address
    const badReceiver = blockchain.openContract(
      tr.Receiver.createFromConfig(
        {
          id: generateRandomContractId(),
          ownable: { owner: setup.deployer.address, pendingOwner: null },
          authorizedCaller: wrongRouterAddress,
          behavior: tr.ReceiverBehavior.Accept,
        },
        code,
      ),
    )
    const result = await badReceiver.sendDeploy(setup.deployer.getSender(), toNano('0.05'))

    expect(result.transactions).toHaveTransaction({
      from: setup.deployer.address,
      to: badReceiver.address,
      deploy: true,
      success: true,
    })

    // Send message to the bad receiver
    const message = setup.createTestMessage(1n, 1n, badReceiver.address)
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
      to: badReceiver.address,
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

  it('Test commit two messages in a single root', async () => {
    const message1 = setup.createTestMessage(1n, 1n)
    const message2 = setup.createTestMessage(2n, 2n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMerkleRootBytes([message1, message2], metadataHash)
    const root = setup.createMerkleRoot(1n, 2n, rootBytes)

    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    const result = await setup.commitReport([root])
    expect(result.transactions).toHaveTransaction({
      from: setup.offRamp.address,
      to: setup.merkleRootAddress(root),
      deploy: true,
      success: true,
    })
  })

  it('Manual execute after permissionlessExecutionThresholdSeconds', async () => {
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

  it('Manual execute: receiver fails, then succeeds', async () => {
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

  it('Manual execute: gasOverride lower than original gasLimit is ignored', async () => {
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

  it('OffRamp should match facility name and ID', async () => {
    const facilityIdVal = await setup.offRamp.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(ofManual.FACILITY_ID))

    const [typeSlice] = await setup.offRamp.getTypeAndVersion()
    const typeStr = typeSlice.loadStringTail()
    expect(typeStr).toBe(ofManual.FACILITY_NAME)

    expect(ofManual.FACILITY_ID).toEqual(facilityId(crc32(ofManual.FACILITY_NAME)))
  })

  it('OffRamp should match error code', async () => {
    const errorCodeVal = await setup.offRamp.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(ofManual.ERROR_CODE))

    expect(ofManual.ERROR_CODE).toEqual(errorCode(crc32(ofManual.FACILITY_NAME)))
  })

  it('Test commit two messages in one root and execute first message with proof', async () => {
    const message1 = setup.createTestMessage(1n, 1n, setup.receiver.address)
    const message2 = setup.createTestMessage(2n, 2n, setup.receiver.address)
    const metadataHash = getDefaultMetadataHash(
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

    assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.Success,
    })
  })

  it('Test commit two messages in one root and execute second message with proof', async () => {
    const message1 = setup.createTestMessage(1n, 1n, setup.receiver.address)
    const message2 = setup.createTestMessage(2n, 2n, setup.receiver.address)
    const metadataHash = getDefaultMetadataHash(
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

    assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 2n,
      messageId: 2n,
      state: of.ExecutionState.Success,
    })
  })

  it('Test commit two messages in one root and execute both messages sequentially', async () => {
    const message1 = setup.createTestMessage(1n, 1n, setup.receiver.address)
    const message2 = setup.createTestMessage(2n, 2n, setup.receiver.address)
    const metadataHash = getDefaultMetadataHash(
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
    const metadataHash = getDefaultMetadataHash(
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
    const metadataHash = getDefaultMetadataHash(
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

    assertLog(result.transactions, setup.offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 2n,
      messageId: 2n,
      state: of.ExecutionState.Success,
    })
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

    const metadataHash = getDefaultMetadataHash(
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

    const metadataHash = getDefaultMetadataHash(
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

  it('cannot commit with minSeqNr smaller than current source chain config', async () => {
    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    // First commit to establish minSeqNr
    const message1 = setup.createTestMessage(1n, 1n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const root1Bytes = generateMessageID(message1, metadataHash)
    const root1 = setup.createMerkleRoot(1n, 10n, root1Bytes)

    await setup.commitReport([root1])

    // Check that minSeqNr is now 11
    const config = await setup.offRamp.getSourceChainConfig(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    expect(config.minSeqNr).toBe(11n)

    // Try to commit with minSeqNr smaller than current (should fail)
    const message2 = setup.createTestMessage(5n, 5n)
    const root2Bytes = generateMessageID(message2, metadataHash)
    const root2 = setup.createMerkleRoot(5n, 15n, root2Bytes) // minSeqNr=5 < 11

    await setup.commitReport(
      [root2],
      toNano('0.5'),
      0x02,
      undefined,
      false,
      of.OffRamp.Errors['Error.InvalidInterval'],
    )
  })

  it('cannot commit with minSeqNr higher than maxSeqNr', async () => {
    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    const message = setup.createTestMessage(1n, 1n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)

    // Create root with minSeqNr > maxSeqNr
    const root = setup.createMerkleRoot(10n, 5n, rootBytes) // minSeqNr=10 > maxSeqNr=5

    await setup.commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.InvalidInterval'],
    )
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

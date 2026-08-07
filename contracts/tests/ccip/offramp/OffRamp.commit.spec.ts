import { toNano, beginCell } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import { generateMockTonAddress, bigIntToBuffer } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'
import { expectFailedTransaction } from '../../Logs'
import { ChainSelectors } from '../../utils/Selectors'
import generateMessageID from '../../../src/offramp/generateMessageID'

import * as ocr from '../../../wrappers/libraries/ocr/MultiOCR3Base'
import * as of from '../../../wrappers/gen/ccip/OffRamp'

import { RMNREMOTE_GLOBAL_CURSE_SUBJECT } from '../../../wrappers/ccip/Router'

import * as s from './OffRamp.Setup'

export const PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS = BigInt(60)
describe('OffRamp - Commit and OCR3 validations', () => {
  let blockchain: Blockchain
  let setup: s.OffRampTestSetup

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

  describe('Commit', () => {
    it('should fail on completely empty report (no merkle roots and no price updates)', async () => {
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
      const signatures = s.createSignatures(
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
        of.OffRamp.Errors['OffRamp_Error.EmptyCommitReport'],
      )
    })

    it('should fail when source chain is cursed', async () => {
      const message = setup.createTestMessage()
      const metadataHash = s.getDefaultMetadataHash(
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
          cursedSubjects: s.buildCursedSubjects(
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
        of.OffRamp.Errors['OffRamp_Error.SubjectCursed'],
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

    it('should fail when global cursed', async () => {
      const message = setup.createTestMessage()
      const metadataHash = s.getDefaultMetadataHash(
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
        of.OffRamp.Errors['OffRamp_Error.SubjectCursed'],
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

    it('should be rejected from address different than onRamp', async () => {
      const message = setup.createTestMessage()
      const metadataHash = s.getDefaultMetadataHash(
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
        of.OffRamp.Errors['OffRamp_Error.OnRampAddressMismatch'],
      )
    })

    it('should fail for zero merkle root', async () => {
      const root = setup.createMerkleRoot(1n, 1n, 0n) // merkleRoot is 0

      await setup.setupOCRConfig()
      await setup.setupSourceChainConfig()

      await setup.commitReport(
        [root],
        toNano('0.5'),
        0x01,
        undefined,
        false,
        of.OffRamp.Errors['OffRamp_Error.MerkleRootCannotBeZero'],
      )
    })

    it('should succeed for one merkle root with one empty message', async () => {
      const message = setup.createTestMessage()
      const metadataHash = s.getDefaultMetadataHash(
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

    it('should fail if more than one merkle root', async () => {
      const message = setup.createTestMessage()
      const metadataHash = s.getDefaultMetadataHash(
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
        of.OffRamp.Errors['OffRamp_Error.BatchingNotSupported'],
      )
    })

    it('should fail if source chain is not enabled', async () => {
      const message = setup.createTestMessage()
      const metadataHash = s.getDefaultMetadataHash(
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
      const signatures = s.createSignatures(
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
        of.OffRamp.Errors['OffRamp_Error.SourceChainNotEnabled'],
      )
    })

    it('should fail with more than 64 messages', async () => {
      await setup.setupOCRConfig()
      await setup.setupSourceChainConfig()

      const message = setup.createTestMessage(1n, 1n)
      const metadataHash = s.getDefaultMetadataHash(
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
        of.OffRamp.Errors['OffRamp_Error.TooManyMessagesInReport'],
      )

      // Commit with exactly 64 messages should succeed
      const root2 = setup.createMerkleRoot(1n, 64n, rootBytes)
      await setup.commitReport([root2], toNano('0.5'), 0x02, undefined)
    })

    it('should succeed with two merkle roots with one message each', async () => {
      const message1 = setup.createTestMessage(1n, 1n)
      const message2 = setup.createTestMessage(2n, 2n)

      const metadataHash = s.getDefaultMetadataHash(
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
  })

  it('should succeed with only price updates but no roots', async () => {
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

  it('should succeed with both merkle root and price updates', async () => {
    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    // Create a merkle root
    const message = setup.createTestMessage()
    const metadataHash = s.getDefaultMetadataHash(
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

  it('should succeed with two messages in a single root', async () => {
    const message1 = setup.createTestMessage(1n, 1n)
    const message2 = setup.createTestMessage(2n, 2n)
    const metadataHash = s.getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = s.generateMerkleRootBytes([message1, message2], metadataHash)
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

  it('should fail if minSeqNr is smaller than current source chain config', async () => {
    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    // First commit to establish minSeqNr
    const message1 = setup.createTestMessage(1n, 1n)
    const metadataHash = s.getDefaultMetadataHash(
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
      of.OffRamp.Errors['OffRamp_Error.InvalidInterval'],
    )
  })

  it('should fail if minSeqNr is higher than maxSeqNr', async () => {
    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    const message = setup.createTestMessage(1n, 1n)
    const metadataHash = s.getDefaultMetadataHash(
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
      of.OffRamp.Errors['OffRamp_Error.InvalidInterval'],
    )
  })

  it('should increase latestPriceSequenceNumber with each commit', async () => {
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

  it('should fail if stale price updates', async () => {
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
    const metadataHash = s.getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = setup.createMerkleRoot(1n, 1n, rootBytes)

    await setup.setupSourceChainConfig()
    await setup.commitReport([root], toNano('0.5'), 0x08, priceUpdates) // 0x08 < 0x10, price update should be ignored
    latestSeq = await setup.offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x10n) // Still at 0x10, but merkle root was committed
  })

  it('should update source chain minSeqNr correctly to maxSeqNr + 1', async () => {
    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    // First commit with minSeqNr=1, maxSeqNr=5
    const message1 = setup.createTestMessage(1n, 1n)
    const metadataHash = s.getDefaultMetadataHash(
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
    expect(config2.onRamp.toString()).toBe(s.EVM_ONRAMP_ADDRESS_TEST.toString())
  })

  it('should succeed with large sequence number gap', async () => {
    await setup.setupOCRConfig()
    await setup.setupSourceChainConfig()

    // Commit with a large gap: minSeqNr=1, maxSeqNr=100
    const message = setup.createTestMessage(1n, 1n)
    const metadataHash = s.getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = setup.createMerkleRoot(1n, 10n, rootBytes)

    const value = toNano('1')
    await setup.commitReport([root], value)

    // minSeqNr should jump to 101 // TODO inconsistant
    const config = await setup.offRamp.getSourceChainConfig(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    expect(config.minSeqNr).toBe(11n)
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

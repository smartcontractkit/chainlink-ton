import { toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'

import { generateMockTonAddress } from '../../../src/utils'
import * as coverage from '../../coverage/coverage'
import { expectSuccessfulTransaction, expectFailedTransaction } from '../../Logs'

import * as ocr from '../../../wrappers/libraries/ocr/MultiOCR3Base'

import * as of from '../../../wrappers/gen/ccip/OffRamp'

import * as s from './OffRamp.Setup'

export const PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS = BigInt(60)
describe('OffRamp - Set OCR3 Config', () => {
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

  it('should succeed with two OCR3 configs', async () => {
    await setup.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)
    await setup.setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
  })

  it('should fail for commit plugin config without signature verification', async () => {
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
      of.OffRamp.Errors['OffRamp_Error.SignatureVerificationRequiredInCommitPlugin'],
    )
  })

  it('should fail for execute plugin config with signature verification', async () => {
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
      of.OffRamp.Errors['OffRamp_Error.SignatureVerificationNotAllowedInExecutionPlugin'],
    )
  })

  it('should succeed for commit plugin config with signature verification enabled', async () => {
    const result = await setup.offRamp.sendOCR3BaseSetOCR3Config(
      setup.deployer.getSender(),
      ...setup.createDefaultOCRConfig({
        ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
        isSignatureVerificationEnabled: true, // Valid
      }),
    )

    expectSuccessfulTransaction(result, setup.deployer.address, setup.offRamp.address)
  })

  it('should succeed for execute plugin config without signature verification', async () => {
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

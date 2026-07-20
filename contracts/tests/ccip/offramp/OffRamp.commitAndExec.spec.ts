import { Cell, toNano, beginCell, Dictionary, StateInit, contractAddress, Address } from '@ton/core'
import { KeyPair } from '@ton/crypto'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { crc32 } from 'zlib'
import {
  generateMockTonAddress,
  bigIntToBuffer,
  uint8ArrayToBigInt,
  asSnakedCell,
  generateEd25519KeyPair,
  generateRandomContractId,
  WRAPPED_NATIVE,
  bigIntToUint8Array,
  generateRandomTonAddress,
} from '../../../src/utils'
import * as dict from '../../../src/utils/dict'
import * as fq from '../../../wrappers/ccip/FeeQuoter'
import * as CCIPLogs from '../../../wrappers/ccip/Logs'
import * as mr from '../../../wrappers/ccip/MerkleRoot'
import * as NameSpace from '../../../wrappers/ccip/NameSpace'
import * as ofManual from '../../../wrappers/ccip/OffRamp'
import * as rx from '../../../wrappers/ccip/ReceiveExecutor'
import * as rt from '../../../wrappers/ccip/Router'
import { contractCode } from '../../../wrappers/codeLoader'
import * as tr from '../../../wrappers/examples/Receiver'
import * as of from '../../../wrappers/gen/ccip/OffRamp'
import * as deployable from '../../../wrappers/libraries/Deployable'
import * as OCR3Logs from '../../../wrappers/libraries/ocr/Logs'
import * as ocr from '../../../wrappers/libraries/ocr/MultiOCR3Base'
import { facilityId, errorCode } from '../../../wrappers/utils'
import * as coverage from '../../coverage/coverage'
import * as ownable2StepSpec from '../../lib/access/Ownable2StepSpec'
import { MerkleHelper } from '../../lib/merkle_proof/helpers/MerkleMultiProofHelper'
import { expectSuccessfulTransaction, assertLog, expectFailedTransaction } from '../../Logs'
import { setupTestFeeQuoter } from '../helpers/SetUp'
import { deployOffRampContract } from './OffRamp.Setup'
import { ChainSelectors } from '../../utils/Selectors'
import generateMessageID, { getMetadataHash } from '../../../src/offramp/generateMessageID'
import { createSignatures, getMerkleRootID } from './OffRamp.Setup'

const getDefaultMetadataHash = (sourceChainSelector: bigint): bigint =>
  getMetadataHash(sourceChainSelector, ChainSelectors.testnet.ton, EVM_ONRAMP_ADDRESS_TEST)

export const EVM_SENDER_ADDRESS_TEST = 0x1a5fdbc891c5d4e6ad68064ae45d43146d4f9f3an
export const EVM_ONRAMP_ADDRESS_TEST = beginCell()
  .storeBuffer(Buffer.from('111111c891c5d4e6ad68064ae45d43146d4f9f3a', 'hex'), 20)
  .asSlice()
export const PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS = BigInt(60)
describe('OffRamp - Unit Tests', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let offRamp: SandboxContract<of.OffRamp>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<fq.FeeQuoter>
  let receiver: SandboxContract<tr.Receiver>
  let deployerCode: Cell
  let merkleRootCodeRaw: Cell
  let receiveExecutorCodeRaw: Cell
  let offRampCodeRaw: Cell
  let routerCodeRaw: Cell
  let feeQuoterCodeRaw: Cell
  let tokenRegistryCodeRaw: Cell
  let transmitters: SandboxContract<TreasuryContract>[]
  let signers: KeyPair[]
  let signersPublicKeys: bigint[]

  // Constants and configuration
  const configDigest: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcden

  // Helper functions for configuration and data creation
  //
  const warpTime = (period: number) => {
    blockchain.now = blockchain.now!! + period
  }

  const createDefaultOCRConfig = (
    overrides: Partial<Omit<of.OCR3Base_SetOCR3Config, '$'>> = {},
  ): [bigint, of.OCR3Base_SetOCR3Config] => [
    toNano('100'),
    of.OCR3Base_SetOCR3Config.create({
      configDigest,
      ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
      bigF: 1n,
      isSignatureVerificationEnabled: true,
      signers: signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
      ...overrides,
    }),
  ]

  const createDefaultUpdateSourceChainConfigs = (
    overrides: Partial<Omit<of.SourceChainConfig, '$'>> = {},
  ): of.SourceChainConfigUpdate[] => [
    of.SourceChainConfigUpdate.create({
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      config: of.SourceChainConfig.create({
        router: router.address,
        isEnabled: true,
        minSeqNr: 1n,
        isRMNVerificationDisabled: true,
        onRamp: EVM_ONRAMP_ADDRESS_TEST,
        ...overrides,
      }),
    }),
    of.SourceChainConfigUpdate.create({
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000002,
      config: of.SourceChainConfig.create({
        router: router.address,
        isEnabled: true,
        minSeqNr: 1n,
        isRMNVerificationDisabled: true,
        onRamp: EVM_ONRAMP_ADDRESS_TEST,
        ...overrides,
      }),
    }),
  ]

  const createTestMessage = (
    sequenceNumber = 1n,
    messageId = 1n,
    receiverAddress = generateMockTonAddress(),
    data: Cell = Cell.EMPTY,
  ): of.Any2TVMRampMessage => {
    const header = of.RampMessageHeader.create({
      messageId,
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      destChainSelector: ChainSelectors.testnet.ton,
      sequenceNumber,
      nonce: 0n,
    })

    return of.Any2TVMRampMessage.create({
      header,
      sender: beginCell().storeBuffer(bigIntToBuffer(EVM_SENDER_ADDRESS_TEST)).asSlice(),
      data: data,
      receiver: receiverAddress,
      gasLimit: toNano('0.03'), // 200_000_000 nanotons
      tokenAmounts: null,
    })
  }

  const createMerkleRoot = (
    minSeqNr: bigint,
    maxSeqNr: bigint,
    merkleRootBytes: bigint,
  ): of.MerkleRoot =>
    of.MerkleRoot.create({
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      onRampAddress: EVM_ONRAMP_ADDRESS_TEST,
      minSeqNr,
      maxSeqNr,
      merkleRoot: merkleRootBytes,
    })

  const generateMerkleRootBytes = (
    messages: of.Any2TVMRampMessage[],
    metadataHash: bigint,
  ): bigint => {
    let hashedMessages = messages.map((msg) => {
      return generateMessageID(msg, metadataHash)
    })

    let merkleHelper: MerkleHelper = new MerkleHelper()

    return merkleHelper.getMerkleRoot(hashedMessages)
  }

  const setupOCRConfigs = async () => {
    await setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
    await setupSourceChainConfig()
  }

  const setupOCRConfig = async (
    ocrPluginType: bigint = ocr.OCR3_PLUGIN_TYPE_COMMIT,
    overrides: Partial<Omit<of.OCR3Base_SetOCR3Config, 'ocrPluginType' | '$'>> = {},
  ) => {
    const result = await offRamp.sendOCR3BaseSetOCR3Config(
      deployer.getSender(),
      ...createDefaultOCRConfig({ ocrPluginType, ...overrides }),
    )
    expectSuccessfulTransaction(result, deployer.address, offRamp.address)

    assertLog(result.transactions, offRamp.address, OCR3Logs.LogTypes.OCR3BaseConfigSet, {
      ocrPluginType,
      configDigest,
      signers: overrides.signers ?? signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
      bigF: 1,
    })

    return result
  }

  const setupSourceChainConfig = async (
    overrides: Partial<Omit<of.SourceChainConfig, '$'>> = {},
    isInitialSetup = true,
  ) => {
    const configs = createDefaultUpdateSourceChainConfigs({ ...overrides })
    const result = await offRamp.sendOffRampUpdateSourceChainConfigs(
      deployer.getSender(),
      toNano('0.5'),
      {
        configs,
      },
    )
    expectSuccessfulTransaction(result, deployer.address, offRamp.address)

    if (isInitialSetup) {
      for (const config of configs) {
        assertLog(
          result.transactions,
          offRamp.address,
          CCIPLogs.LogTypes.SourceChainSelectorAdded,
          {
            sourceChainSelector: config.sourceChainSelector,
          },
        )
      }
    }

    for (const config of configs) {
      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.SourceChainConfigUpdated, {
        sourceChainSelector: config.sourceChainSelector,
        sourceChainConfig: {
          ...config.config,
          ...overrides,
          onRamp: config.config.onRamp,
          minSeqNr: expect.anything(),
        },
      })
    }

    return result
  }

  // Helper to build CursedSubjects from an array of subject IDs
  const buildCursedSubjects = (subjects: Set<bigint>): of.CursedSubjects => {
    return of.CursedSubjects.create({ data: subjects })
  }

  // Helper function to test commit report flow
  const commitReport = async (
    merkleRoots: of.MerkleRoot[],
    value: bigint = toNano('0.5'),
    sequenceBytes = 0x01,
    priceUpdates: of.PriceUpdates | null = null,
    expectSuccess = true,
    exitCode = 0,
  ) => {
    // Build the CommitReport using the generated wrapper types
    const genReport = of.CommitReport.create({
      priceUpdates: priceUpdates ? of.PriceUpdates.create(priceUpdates) : null,
      merkleRoots,
    })

    const reportContext: ocr.ReportContext = { configDigest, padding: 0n, sequenceBytes }
    const signatures = createSignatures(
      [signers[0], signers[1]],
      ocr.hashReport(of.CommitReport.toCell(genReport), reportContext),
    )

    const result = await offRamp.sendOffRampCommit(transmitters[0].getSender(), value, {
      reportContext: of.ReportContext.create({
        configDigest,
        sequenceBytes: BigInt(sequenceBytes),
      }),
      report: genReport,
      signatures,
    })
    if (expectSuccess) {
      expectSuccessfulTransaction(result, transmitters[0].address, offRamp.address)

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.CommitReportAccepted, {
        merkleRoot: merkleRoots[0] ?? null,
        priceUpdates,
      })
    } else {
      expectFailedTransaction(result, transmitters[0].address, offRamp.address, exitCode)
    }

    return result
  }

  //TODO: When we test for token transfers this will take more parameters
  const createExecuteReport = (
    messages: of.Any2TVMRampMessage[],
    sourceChainSelector = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
  ): of.ExecutionReport =>
    of.ExecutionReport.create({
      sourceChainSelector,
      // TODO tolk type should should be snakedCell
      messages: asSnakedCell(messages, (msg) =>
        (() => {
          const b = beginCell()
          of.Any2TVMRampMessage.store(msg, b)
          return b
        })(),
      ),
      offchainTokenData: Cell.EMPTY, // TODO tolk type should be snakedCell
      proofs: [],
      proofFlagBits: 0n,
    })

  // Helper function to test execute report flow
  const executeReport = async (
    report: of.ExecutionReport,
    sequenceBytes = 0x02,
    expectSuccess = true,
  ) => {
    const result = await offRamp.sendOffRampExecute(transmitters[0].getSender(), toNano('0.2'), {
      reportContext: of.ReportContext.create({
        configDigest,
        sequenceBytes: BigInt(sequenceBytes),
      }),
      report,
    })

    if (expectSuccess) {
      expectSuccessfulTransaction(result, transmitters[0].address, offRamp.address)
    }

    return result
  }

  const manualExecuteReport = async (
    report: of.ExecutionReport,
    gasOverride: bigint | undefined = undefined,
    expectSuccess = true,
  ) => {
    const result = await offRamp.sendOffRampManuallyExecute(
      transmitters[0].getSender(),
      toNano('0.5'),
      {
        report,
        gasOverride: gasOverride ?? 0n,
      },
    )

    if (expectSuccess) {
      expectSuccessfulTransaction(result, transmitters[0].address, offRamp.address)
    }

    return result
  }

  const executeReportExpectingFailure = async (
    report: of.ExecutionReport,
    expectedErrorCode: number,
    sequenceBytes = 0x02,
  ) => {
    const result = await executeReport(report, sequenceBytes, false)
    expectFailedTransaction(result, transmitters[0].address, offRamp.address, expectedErrorCode)
    return result
  }

  const setupAndCommitMessage = async (message: of.Any2TVMRampMessage) => {
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupOCRConfigs()
    await commitReport([root])

    return { root, metadataHash, rootBytes }
  }

  const merkleRootAddress = (root: of.MerkleRoot) => {
    const data = deployable.builder.data.contractData
      .encode({
        owner: offRamp.address,
        id: deployable.builder.data.namespaced.encode({
          namespace: NameSpace.CCIPNamespace.MerkleRoot,
          id: getMerkleRootID(root.merkleRoot),
        }),
      })
      .endCell()

    const init: StateInit = {
      code: deployerCode,
      data,
    }

    const workchain = 0
    return contractAddress(workchain, init)
  }

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
    blockchain.now = 10000
    deployer = await blockchain.treasury('deployer')
    deployerCode = await contractCode.ccip.local('Deployable')
    merkleRootCodeRaw = await contractCode.ccip.local('MerkleRoot')
    offRampCodeRaw = await contractCode.ccip.local('OffRamp')
    routerCodeRaw = await contractCode.ccip.local('Router')
    feeQuoterCodeRaw = await contractCode.ccip.local('FeeQuoter')
    receiveExecutorCodeRaw = await contractCode.ccip.local('ReceiveExecutor')
    tokenRegistryCodeRaw = await contractCode.ccip.local('TokenRegistry')

    transmitters = await Promise.all([
      blockchain.treasury('transmitter1'),
      blockchain.treasury('transmitter2'),
      blockchain.treasury('transmitter3'),
      blockchain.treasury('transmitter4'),
    ])

    signers = await Promise.all([
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
    ])

    signersPublicKeys = signers.map((signer) => uint8ArrayToBigInt(signer.publicKey))

    // Populate the emulator library code
    // https://docs.ton.org/v3/documentation/data-formats/tlb/library-cells#testing-in-the-blueprint
    const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())

    _libs.set(BigInt(`0x${merkleRootCodeRaw.hash().toString('hex')}`), merkleRootCodeRaw)
    _libs.set(BigInt(`0x${receiveExecutorCodeRaw.hash().toString('hex')}`), receiveExecutorCodeRaw)

    const libs = beginCell().storeDictDirect(_libs).endCell()
    blockchain.libs = libs

    // setup fee quoter
    feeQuoter = await setupTestFeeQuoter(deployer, blockchain)
  })

  beforeEach(async () => {
    // setup offramp
    {
      let code = offRampCodeRaw

      // Use a library reference
      let merkleRootLibPrep = beginCell()
        .storeUint(2, 8)
        .storeBuffer(merkleRootCodeRaw.hash())
        .endCell()
      let merkleRootCode = new Cell({
        exotic: true,
        bits: merkleRootLibPrep.bits,
        refs: merkleRootLibPrep.refs,
      })

      let receiveExecutorLibPrep = beginCell()
        .storeUint(2, 8)
        .storeBuffer(receiveExecutorCodeRaw.hash())
        .endCell()
      let receiveExecutorCode = new Cell({
        exotic: true,
        bits: receiveExecutorLibPrep.bits,
        refs: receiveExecutorLibPrep.refs,
      })

      offRamp = await deployOffRampContract(blockchain, deployer, code, {
        deployerCode: deployerCode,
        merkleRootCode: merkleRootCode,
        receiveExecutorCode: receiveExecutorCode,
        feeQuoter: feeQuoter.address,
      })

      let resultFeeQuoterAddAuthorizedCaller = await feeQuoter.sendAddPriceUpdater(
        deployer.getSender(),
        {
          value: toNano('0.01'),
          msg: {
            priceUpdater: offRamp.address,
          },
        },
      )
      expect(resultFeeQuoterAddAuthorizedCaller.transactions).toHaveTransaction({
        from: deployer.address,
        to: feeQuoter.address,
        success: true,
      })
    }
    // setup router
    //
    {
      let data: rt.Storage = {
        id: generateRandomContractId(),
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        wrappedNative: WRAPPED_NATIVE,
        onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
        offRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
        tokenRegistryDeployment: {
          deployableCode: deployerCode,
          tokenRegistryCode: tokenRegistryCodeRaw,
        },
      }

      router = blockchain.openContract(rt.Router.createFromConfig(data, routerCodeRaw))

      const result = await router.sendInternal(deployer.getSender(), toNano('1'), Cell.EMPTY)

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        deploy: true,
        success: true,
      })

      // setup ramp
      const updateRampsResult = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
        value: toNano('1'),
        data: {
          queryID: BigInt(0),
          offRampAdds: {
            sourceChainSelectors: [ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001],
            offRamp: offRamp.address,
          },
        },
      })
      expect(updateRampsResult.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        success: true,
      })
    }

    // Deploy test receiver
    {
      let code = await contractCode.ccip.local('ccip.test.receiver')
      receiver = blockchain.openContract(
        tr.Receiver.createFromConfig(
          {
            id: generateRandomContractId(),
            ownable: { owner: deployer.address, pendingOwner: null },
            authorizedCaller: router.address,
            behavior: tr.ReceiverBehavior.Accept,
          },
          code,
        ),
      )
      const result = await receiver.sendDeploy(deployer.getSender(), toNano('0.05'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiver.address,
        deploy: true,
        success: true,
      })
    }
  }, 60000) // setup can take a while, since we deploy contracts

  it('supports ownable messages', async () => {
    const other = await blockchain.treasury('other')
    await ownable2StepSpec.ownable2StepSpec(deployer, other, offRamp, {})
  })

  it('should deploy', async () => {
    // the check is done inside beforeEach
    // blockchain and counter are ready to use
  })

  it('should handle two OCR3 configs', async () => {
    await setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
  })

  describe('OCR3 Config Validation Tests', () => {
    it('should reject commit plugin config without signature verification', async () => {
      const result = await offRamp.sendOCR3BaseSetOCR3Config(
        deployer.getSender(),
        ...createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
          isSignatureVerificationEnabled: false, // Invalid for commit
        }),
      )

      expectFailedTransaction(
        result,
        deployer.address,
        offRamp.address,
        of.OffRamp.Errors['Error.SignatureVerificationRequiredInCommitPlugin'],
      )
    })

    it('should reject execute plugin config with signature verification', async () => {
      const result = await offRamp.sendOCR3BaseSetOCR3Config(
        deployer.getSender(),
        ...createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_EXECUTE,
          isSignatureVerificationEnabled: true, // Invalid for execute
          signers: signersPublicKeys,
        }),
      )

      expectFailedTransaction(
        result,
        deployer.address,
        offRamp.address,
        of.OffRamp.Errors['Error.SignatureVerificationNotAllowedInExecutionPlugin'],
      )
    })

    it('should accept commit plugin config with signature verification enabled', async () => {
      const result = await offRamp.sendOCR3BaseSetOCR3Config(
        deployer.getSender(),
        ...createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
          isSignatureVerificationEnabled: true, // Valid
        }),
      )

      expectSuccessfulTransaction(result, deployer.address, offRamp.address)
    })

    it('should accept execute plugin config without signature verification', async () => {
      const result = await offRamp.sendOCR3BaseSetOCR3Config(
        deployer.getSender(),
        ...createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_EXECUTE,
          isSignatureVerificationEnabled: false, // Valid
          signers: [],
        }),
      )

      expectSuccessfulTransaction(result, deployer.address, offRamp.address)
    })

    it('should reset latestPriceSequenceNumber when commit config changes', async () => {
      // First, set initial commit config and update price sequence number
      await setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)

      const sourceToken = generateMockTonAddress()
      const priceUpdates = of.PriceUpdates.create({
        tokenPriceUpdates: [of.TokenPriceUpdate.create({ sourceToken, usdPerToken: 100n })],
        gasPriceUpdates: [],
      })

      // Commit with sequence 0x10
      await commitReport([], toNano('0.5'), 0x10, priceUpdates)
      let latestSeq = await offRamp.getLatestPriceSequenceNumber()
      expect(latestSeq).toBe(0x10n)

      // Change commit config (new config digest)
      const newConfigDigest = 0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789n
      const result = await offRamp.sendOCR3BaseSetOCR3Config(
        deployer.getSender(),
        ...createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
          configDigest: newConfigDigest,
        }),
      )
      expectSuccessfulTransaction(result, deployer.address, offRamp.address)

      // Price sequence number should be reset to 0
      latestSeq = await offRamp.getLatestPriceSequenceNumber()
      expect(latestSeq).toBe(0n)
    })

    it('should not reset latestPriceSequenceNumber when execute config changes', async () => {
      // Setup both configs and set price sequence
      await setupOCRConfigs()

      const sourceToken = generateMockTonAddress()
      const priceUpdates = of.PriceUpdates.create({
        tokenPriceUpdates: [of.TokenPriceUpdate.create({ sourceToken, usdPerToken: 100n })],
        gasPriceUpdates: [],
      })

      await commitReport([], toNano('0.5'), 0x10, priceUpdates)
      let latestSeq = await offRamp.getLatestPriceSequenceNumber()
      expect(latestSeq).toBe(0x10n)

      // Change execute config (not commit)
      const newConfigDigest = 0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789n
      const result = await offRamp.sendOCR3BaseSetOCR3Config(
        deployer.getSender(),
        ...createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_EXECUTE,
          configDigest: newConfigDigest,
          isSignatureVerificationEnabled: false,
          signers: [],
        }),
      )
      expectSuccessfulTransaction(result, deployer.address, offRamp.address)

      // Price sequence number should remain unchanged
      latestSeq = await offRamp.getLatestPriceSequenceNumber()
      expect(latestSeq).toBe(0x10n)
    })
  })

  it('Test commit report fails with completely empty report (no merkle roots and no price updates)', async () => {
    await setupOCRConfig()

    // Create a commit report with empty merkleRoots and undefined priceUpdates
    const report = of.CommitReport.create({
      priceUpdates: null,
      merkleRoots: [],
    })
    const reportContext: ocr.ReportContext = { configDigest, padding: 0n, sequenceBytes: 0x01 }
    const signatures = createSignatures(
      [signers[0], signers[1]],
      ocr.hashReport(of.CommitReport.toCell(report), reportContext),
    )

    const result = await offRamp.sendOffRampCommit(transmitters[0].getSender(), toNano('0.5'), {
      reportContext: of.ReportContext.create({
        configDigest,
        sequenceBytes: 1n,
      }),
      report,
      signatures,
    })

    expectFailedTransaction(
      result,
      transmitters[0].address,
      offRamp.address,
      of.OffRamp.Errors['Error.EmptyCommitReport'],
    )
  })

  it('Test commit fails when source chain is cursed', async () => {
    const message = createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupOCRConfig()
    await setupSourceChainConfig()

    // Curse source chain
    const curseResult = await offRamp.sendOffRampUpdateCursedSubjects(
      deployer.getSender(),
      toNano('0.5'),
      {
        cursedSubjects: buildCursedSubjects(
          new Set([ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001]),
        ),
      },
    )
    expect(curseResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })
    let cursedSubjects = await offRamp.getCursedSubjects()
    expect(cursedSubjects).toEqual([ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001])

    // Attempt to commit - should fail with SubjectCursed
    await commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.SubjectCursed'],
    )

    // Uncurse source chain
    const uncurseResult = await offRamp.sendOffRampUpdateCursedSubjects(
      deployer.getSender(),
      toNano('0.5'),
      {
        cursedSubjects: of.CursedSubjects.create({ data: new Set([]) }),
      },
    )
    expect(uncurseResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })
    cursedSubjects = await offRamp.getCursedSubjects()
    expect(cursedSubjects).toEqual([])

    // Now commit should succeed
    await commitReport([root], toNano('0.5'), 0x02, undefined)
  })

  it('Test commit fails when global cursed', async () => {
    const message = createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupOCRConfig()
    await setupSourceChainConfig()

    // Curse all lanes
    const curseResult = await offRamp.sendOffRampUpdateCursedSubjects(
      deployer.getSender(),
      toNano('0.5'),
      {
        cursedSubjects: of.CursedSubjects.create({
          data: new Set([rt.RMNREMOTE_GLOBAL_CURSE_SUBJECT]),
        }),
      },
    )
    expect(curseResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })
    let cursedSubjects = await offRamp.getCursedSubjects()
    expect(cursedSubjects).toEqual([rt.RMNREMOTE_GLOBAL_CURSE_SUBJECT])

    // Attempt to commit - should fail with SubjectCursed
    await commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.SubjectCursed'],
    )

    // Uncurse all lanes
    const uncurseResult = await offRamp.sendOffRampUpdateCursedSubjects(
      deployer.getSender(),
      toNano('0.5'),
      {
        cursedSubjects: of.CursedSubjects.create({ data: new Set([]) }),
      },
    )
    expect(uncurseResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })
    cursedSubjects = await offRamp.getCursedSubjects()
    expect(cursedSubjects).toEqual([])

    // Now commit should succeed
    await commitReport([root], toNano('0.5'), 0x02, undefined)
  })

  it('Test commit fails with onRamp address mismatch', async () => {
    const message = createTestMessage()
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

    await setupOCRConfig()
    await setupSourceChainConfig()

    await commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.OnRampAddressMismatch'],
    )
  })

  it('Test commit fails with zero merkle root', async () => {
    const root = createMerkleRoot(1n, 1n, 0n) // merkleRoot is 0

    await setupOCRConfig()
    await setupSourceChainConfig()

    await commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.MerkleRootCannotBeZero'],
    )
  })

  it('Test commit with one merkle root for one empty message', async () => {
    const message = createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupOCRConfig()
    await setupSourceChainConfig()

    const result = await commitReport([root])

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: merkleRootAddress(root),
      deploy: true,
      success: true,
    })
  })

  it('Test commit report fails if more than one merkle root', async () => {
    const message = createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root1 = createMerkleRoot(1n, 1n, rootBytes)
    const root2 = createMerkleRoot(2n, 2n, rootBytes)

    await setupOCRConfig()
    await setupSourceChainConfig()

    await commitReport(
      [root1, root2],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.BatchingNotSupported'],
    )
  })

  it('Test commit report fails if source chain is not enabled', async () => {
    const message = createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupOCRConfig()
    await setupSourceChainConfig({ isEnabled: false }) // disabled source chain

    const report = of.CommitReport.create({
      priceUpdates: null,
      merkleRoots: [root],
    })
    const reportContext: ocr.ReportContext = {
      configDigest,
      padding: 0n,
      sequenceBytes: 0x01,
    }
    const signatures = createSignatures(
      [signers[0], signers[1]],
      ocr.hashReport(of.CommitReport.toCell(report), reportContext),
    )

    const result = await offRamp.sendOffRampCommit(transmitters[0].getSender(), toNano('0.5'), {
      reportContext: of.ReportContext.create({
        configDigest,
        sequenceBytes: 1n,
      }),
      report,
      signatures,
    })

    expectFailedTransaction(
      result,
      transmitters[0].address,
      offRamp.address,
      of.OffRamp.Errors['Error.SourceChainNotEnabled'],
    )
  })

  it('Test commit with more than 64 messages fails', async () => {
    await setupOCRConfig()
    await setupSourceChainConfig()

    const message = createTestMessage(1n, 1n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)

    // Commit with more than 64 messages should fail
    const root = createMerkleRoot(1n, 65n, rootBytes)

    await commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.TooManyMessagesInReport'],
    )

    // Commit with exactly 64 messages should succeed
    const root2 = createMerkleRoot(1n, 64n, rootBytes)
    await commitReport([root2], toNano('0.5'), 0x02, undefined)
  })

  it('Test commit with two merkle roots with one message each', async () => {
    const message1 = createTestMessage(1n, 1n)
    const message2 = createTestMessage(2n, 2n)

    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const root1Bytes = generateMessageID(message1, metadataHash)
    const root2Bytes = generateMessageID(message2, metadataHash)

    const root1 = createMerkleRoot(1n, 1n, root1Bytes)
    const root2 = createMerkleRoot(2n, 2n, root2Bytes)

    await setupOCRConfig()
    await setupSourceChainConfig()

    const result1 = await commitReport([root1])

    expect(result1.transactions).toHaveTransaction({
      from: offRamp.address,
      to: merkleRootAddress(root1),
      deploy: true,
      success: true,
    })

    const result2 = await commitReport([root2])
    expect(result2.transactions).toHaveTransaction({
      from: offRamp.address,
      to: merkleRootAddress(root2),
      deploy: true,
      success: true,
    })
  })

  it('Test execute fails when root was not committed', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)

    // Setup configurations but don't commit any report
    await setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
    await setupSourceChainConfig()

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

    const executeResult = await offRamp.sendOffRampExecute(
      transmitters[0].getSender(),
      toNano('0.5'),
      {
        reportContext: of.ReportContext.create({
          configDigest,
          sequenceBytes: 0x02n,
        }),
        report: executeReport,
      },
    )

    // We expect our message to succeed but the message from the offRamp to MerkleRoot should fail
    expect(executeResult.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: offRamp.address,
      success: true, // The execute call itself succeeds
    })

    expect(executeResult.transactions).toHaveTransaction({
      from: offRamp.address,
      success: false,
    })

    // Check that no message was sent to the receiver (message processing failed)
    expect(executeResult.transactions).not.toHaveTransaction({
      from: router.address,
      to: receiver.address,
    })
  })

  it('Test execute fails when different root was committed', async () => {
    const message = createTestMessage(2n, 2n, receiver.address)
    const differentMessage = createTestMessage(1n, 1n, receiver.address)

    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const differentRootBytes = generateMessageID(differentMessage, metadataHash)
    const differentRoot = createMerkleRoot(1n, 1n, differentRootBytes)

    // Setup configurations
    await setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
    await setupSourceChainConfig()

    // Commit a different merkle root than what we'll try to execute
    await commitReport([differentRoot])

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

    const executeResult = await offRamp.sendOffRampExecute(
      transmitters[0].getSender(),
      toNano('0.5'),
      {
        reportContext: of.ReportContext.create({
          configDigest,
          sequenceBytes: 0x02n,
        }),
        report: executeReport,
      },
    )

    expect(executeResult.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: offRamp.address,
      success: true,
    })

    expect(executeResult.transactions).toHaveTransaction({
      from: offRamp.address,
      success: false,
    })

    // Check that no message was sent to the receiver (message verification failed)
    expect(executeResult.transactions).not.toHaveTransaction({
      from: router.address,
      to: receiver.address,
    })
  })

  it('Test execute fails when same message is sent twice', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 1n, rootBytes)

    // Setup configurations
    await setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(ocr.OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
    await setupSourceChainConfig()

    // Send the commit report
    await commitReport([root])

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
    const firstExecuteResult = await offRamp.sendOffRampExecute(
      transmitters[0].getSender(),
      toNano('0.5'),
      {
        reportContext: of.ReportContext.create({
          configDigest,
          sequenceBytes: 0x02n,
        }),
        report: executeReport,
      },
    )

    expect(firstExecuteResult.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
    })

    // Second execution with the same report should fail
    const secondExecuteResult = await offRamp.sendOffRampExecute(
      transmitters[0].getSender(),
      toNano('0.5'),
      {
        reportContext: of.ReportContext.create({
          configDigest,
          sequenceBytes: 0x02n,
        }),
        report: executeReport,
      },
    )

    // The execute call itself should succeed but the message processing should fail
    expect(secondExecuteResult.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: offRamp.address,
      success: true,
    })

    // There should be a failed transaction with the specific error code from offRamp to MerkleRoot
    expect(secondExecuteResult.transactions).toHaveTransaction({
      from: offRamp.address,
      exitCode: mr.MerkleRootError.SkippedAlreadyExecutedMessage,
      success: false,
    })
  })

  it('Test execute fails with empty report', async () => {
    await setupOCRConfigs()
    const report = createExecuteReport([])
    await executeReportExpectingFailure(report, of.OffRamp.Errors['Error.EmptyExecutionReport'])
  })

  it('Test execute fails when message destChainSelector is wrong', async () => {
    const wrongDestMessage = createTestMessage(1n, 1n, receiver.address)
    wrongDestMessage.header.destChainSelector = 999999n

    await setupAndCommitMessage(wrongDestMessage)
    const report = createExecuteReport([wrongDestMessage])
    await executeReportExpectingFailure(
      report,
      of.OffRamp.Errors['Error.InvalidMessageDestChainSelector'],
    )
  })

  it('Test execute fails when message sourceChainSelector mismatches report', async () => {
    const wrongSourceMessage = createTestMessage(1n, 1n, receiver.address)
    wrongSourceMessage.header.sourceChainSelector = 888888n

    await setupAndCommitMessage(wrongSourceMessage)
    const report = createExecuteReport(
      [wrongSourceMessage],
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    ) // Different from message
    await executeReportExpectingFailure(
      report,
      of.OffRamp.Errors['Error.SourceChainSelectorMismatch'],
    )
  })

  it('Test execute fails when source chain is disabled', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)

    // Setup and commit with enabled chain
    await setupOCRConfigs()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 1n, rootBytes)
    await commitReport([root])

    // Disable source chain for execution
    await setupSourceChainConfig({ isEnabled: false }, false)

    const report = createExecuteReport([message])
    await executeReportExpectingFailure(report, of.OffRamp.Errors['Error.SourceChainNotEnabled'])
  })

  it('Test execute fails when source chain is cursed', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)

    // Setup and commit with enabled chain
    await setupOCRConfigs()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 1n, rootBytes)
    await commitReport([root])

    // Curse source chain
    let result = await offRamp.sendOffRampUpdateCursedSubjects(
      deployer.getSender(),
      toNano('0.5'),
      {
        cursedSubjects: buildCursedSubjects(
          new Set([ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001]),
        ),
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })

    const report = createExecuteReport([message])
    await executeReportExpectingFailure(report, of.OffRamp.Errors['Error.SubjectCursed'])

    // Uncurse source chain
    result = await offRamp.sendOffRampUpdateCursedSubjects(deployer.getSender(), toNano('0.5'), {
      cursedSubjects: of.CursedSubjects.create({ data: new Set([]) }),
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })
  })

  it('Test execute fails when source chain is globally cursed', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)

    // Setup and commit with enabled chain
    await setupOCRConfigs()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 1n, rootBytes)
    await commitReport([root])

    // Curse source chain
    let result = await offRamp.sendOffRampUpdateCursedSubjects(
      deployer.getSender(),
      toNano('0.5'),
      {
        cursedSubjects: of.CursedSubjects.create({
          data: new Set([rt.RMNREMOTE_GLOBAL_CURSE_SUBJECT]),
        }),
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })

    const report = createExecuteReport([message])
    await executeReportExpectingFailure(report, of.OffRamp.Errors['Error.SubjectCursed'])

    // Uncurse source chain
    result = await offRamp.sendOffRampUpdateCursedSubjects(deployer.getSender(), toNano('0.5'), {
      cursedSubjects: of.CursedSubjects.create({ data: new Set([]) }),
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })
  })

  it('Test execute fails when source chain config does not exist', async () => {
    const unknownChainSelector = 777777n
    const message = createTestMessage(1n, 1n, receiver.address)
    message.header.sourceChainSelector = unknownChainSelector

    await setupOCRConfigs()
    const report = createExecuteReport([message], unknownChainSelector)
    await executeReportExpectingFailure(report, of.OffRamp.Errors['Error.SourceChainNotEnabled'])
  })

  it('Test execute succeeds with valid message and proof', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)
    await setupAndCommitMessage(message)

    const report = createExecuteReport([message])
    const result = await executeReport(report)

    // Message should be successfully processed to the receiver
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
    })

    assertLog(
      result.transactions,
      receiver.address,
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
    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      messageId: message.header.messageId,
      state: of.ExecutionState.InProgress,
    })
    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      messageId: message.header.messageId,
      state: of.ExecutionState.Success,
    })
  })

  it('Test execute fails with valid message and proof but low gaslimit', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)
    message.gasLimit = toNano('0.0001') // Set very low gas limit to force failure
    await setupAndCommitMessage(message)

    const report = createExecuteReport([message])
    const result = await executeReport(report)

    // Message should fail due to low gas limit
    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      success: true,
      op: rx.opcodes.in.bounced,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      messageId: message.header.messageId,
      state: of.ExecutionState.InProgress,
    })
    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      messageId: message.header.messageId,
      state: of.ExecutionState.Failure,
    })
  })

  it('Test cannot call dispatch directly', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )

    const messageIdSlice = beginCell()
      .storeUint(generateMessageID(message, metadataHash), 256)
      .asSlice()
    const execId = messageIdSlice.loadUintBig(192)

    const result = await offRamp.sendOffRampDispatchValidated(deployer.getSender(), toNano('0.5'), {
      message,
      execId: execId,
      gasOverride: null,
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: false,
      exitCode: of.OffRamp.Errors['Error.MessageNotFromOwnedContract'],
    })
  })

  it('Can commit with no roots and only price updates', async () => {
    await setupOCRConfig()
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
    const result = await commitReport([], toNano('0.5'), 0x01, priceUpdates)
    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: feeQuoter.address,
      success: true,
    })
    expect(result.transactions).toHaveTransaction({
      from: feeQuoter.address,
      to: transmitters[0].address,
      success: true,
    })
  })

  it('Can commit with both merkle root and price updates', async () => {
    await setupOCRConfig()
    await setupSourceChainConfig()

    // Create a merkle root
    const message = createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 1n, rootBytes)

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

    const result = await commitReport([root], toNano('0.5'), 0x01, priceUpdates)
  })

  it('Test price update sequence number increases with OCR sequence', async () => {
    await setupOCRConfig()

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
    await commitReport([], toNano('0.5'), 0x01, priceUpdates)
    let latestSeq = await offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x01n)

    // Second commit with sequence 0x05 (jump forward)
    await commitReport([], toNano('0.5'), 0x05, priceUpdates)
    latestSeq = await offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x05n)

    // Third commit with higher sequence 0x10
    await commitReport([], toNano('0.5'), 0x10, priceUpdates)
    latestSeq = await offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x10n)
  })

  it('Test stale price updates are rejected', async () => {
    await setupOCRConfig()

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
    await commitReport([], toNano('0.5'), 0x10, priceUpdates)
    let latestSeq = await offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x10n)

    // Try to commit with older sequence 0x05 (should be ignored)
    await commitReport([], toNano('0.5'), 0x05, priceUpdates)
    latestSeq = await offRamp.getLatestPriceSequenceNumber()
    // Sequence should remain at 0x10, stale update ignored
    expect(latestSeq).toBe(0x10n)

    // But commit with same merkle root should succeed (just price update ignored)
    const message = createTestMessage()
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupSourceChainConfig()
    await commitReport([root], toNano('0.5'), 0x08, priceUpdates) // 0x08 < 0x10, price update should be ignored
    latestSeq = await offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x10n) // Still at 0x10, but merkle root was committed
  })

  it('Test source chain minSeqNr updates correctly to maxSeqNr + 1', async () => {
    await setupOCRConfig()
    await setupSourceChainConfig()

    // First commit with minSeqNr=1, maxSeqNr=5
    const message1 = createTestMessage(1n, 1n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const root1Bytes = generateMessageID(message1, metadataHash)
    const root1 = createMerkleRoot(1n, 5n, root1Bytes) // maxSeqNr = 5

    await commitReport([root1])

    // Check that minSeqNr is now 6 (maxSeqNr + 1)
    const config1 = await offRamp.getSourceChainConfig(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    expect(config1.minSeqNr).toBe(6n)

    // Second commit with minSeqNr=6, maxSeqNr=10
    const message2 = createTestMessage(6n, 6n)
    const root2Bytes = generateMessageID(message2, metadataHash)
    const root2 = createMerkleRoot(6n, 10n, root2Bytes) // maxSeqNr = 10

    await commitReport([root2])

    // Check that minSeqNr is now 11 (maxSeqNr + 1)
    const config2 = await offRamp.getSourceChainConfig(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    expect(config2.minSeqNr).toBe(11n)
    // onRamp is a Slice (CrossChainAddress) - the raw bytes without length prefix
    expect(config2.onRamp.toString()).toBe(EVM_ONRAMP_ADDRESS_TEST.toString())
  })

  it('Test commit with large sequence number gap', async () => {
    await setupOCRConfig()
    await setupSourceChainConfig()

    // Commit with a large gap: minSeqNr=1, maxSeqNr=100
    const message = createTestMessage(1n, 1n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)
    const root = createMerkleRoot(1n, 10n, rootBytes)

    const value = toNano('1')
    await commitReport([root], value)

    // minSeqNr should jump to 101
    const config = await offRamp.getSourceChainConfig(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    expect(config.minSeqNr).toBe(11n)
  })

  it('Test receiver notifies success with non-empty data and offRamp emits ExecutionStateChanged: Success', async () => {
    const data = beginCell().storeUint(1, 1).endCell() // receiver now accepts data
    const message = createTestMessage(1n, 1n, receiver.address, data)

    await setupAndCommitMessage(message)
    const report = createExecuteReport([message])
    const result = await executeReport(report)

    // Message should be successfully processed by the receiver
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      value: message.gasLimit,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: receiver.address,
      to: router.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.InProgress,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.Success,
    })

    assertLog(
      result.transactions,
      receiver.address,
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
    const message = createTestMessage(1n, 1n, receiver.address) // empty data (Cell.EMPTY)
    await setupAndCommitMessage(message)
    const report = createExecuteReport([message])
    const result = await executeReport(report)

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.InProgress,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.Success,
    })

    assertLog(
      result.transactions,
      receiver.address,
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
          ownable: { owner: deployer.address, pendingOwner: null },
          authorizedCaller: wrongRouterAddress,
          behavior: tr.ReceiverBehavior.Accept,
        },
        code,
      ),
    )
    const result = await badReceiver.sendDeploy(deployer.getSender(), toNano('0.05'))

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: badReceiver.address,
      deploy: true,
      success: true,
    })

    // Send message to the bad receiver
    const message = createTestMessage(1n, 1n, badReceiver.address)
    await setupAndCommitMessage(message)
    const report = createExecuteReport([message])
    const executeResult = await executeReport(report)

    // The execute call itself should succeed
    expect(executeResult.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: offRamp.address,
      success: true,
    })

    // Message should bounce from the bad receiver (wrong offRamp check fails)
    expect(executeResult.transactions).toHaveTransaction({
      from: router.address,
      to: badReceiver.address,
      success: false,
    })

    // Should emit IN_PROGRESS first
    assertLog(
      executeResult.transactions,
      offRamp.address,
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
      offRamp.address,
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
    const message1 = createTestMessage(1n, 1n)
    const message2 = createTestMessage(2n, 2n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMerkleRootBytes([message1, message2], metadataHash)
    const root = createMerkleRoot(1n, 2n, rootBytes)

    await setupOCRConfig()
    await setupSourceChainConfig()

    const result = await commitReport([root])
    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: merkleRootAddress(root),
      deploy: true,
      success: true,
    })
  })

  it('Manual execute after permissionlessExecutionThresholdSeconds', async () => {
    const message = createTestMessage(1n, 1n, receiver.address) // empty data (Cell.EMPTY)
    await setupAndCommitMessage(message)
    const report = createExecuteReport([message])

    // Try manual exec when is not enabled
    const manualExecFirstAttempt = await manualExecuteReport(report)
    expect(manualExecFirstAttempt.transactions).toHaveTransaction({
      from: offRamp.address,
      success: false,
      exitCode: mr.MerkleRootError.ManualExecutionNotYetEnabled,
    })

    // Almost there, still needs to fail
    warpTime(Number(PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS))

    const manualExecSecondAttempt = await manualExecuteReport(report)
    expect(manualExecSecondAttempt.transactions).toHaveTransaction({
      from: offRamp.address,
      success: false,
      exitCode: mr.MerkleRootError.ManualExecutionNotYetEnabled,
    })

    // One more sec and we are ready to go
    warpTime(1)

    const manualExecThirdAttempt = await manualExecuteReport(report, undefined, true)
    expect(manualExecThirdAttempt.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      value: message.gasLimit,
      success: true,
    })

    assertLog(
      manualExecThirdAttempt.transactions,
      offRamp.address,
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
      offRamp.address,
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
      receiver.address,
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
    const message = createTestMessage(1n, 1n, receiver.address) // empty data (Cell.EMPTY)
    await setupAndCommitMessage(message)
    const report = createExecuteReport([message])

    const result = await receiver.sendUpdateBehavior(deployer.getSender(), toNano('0.1'), {
      behavior: tr.ReceiverBehavior.RejectAll,
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: true,
    })

    const result2 = await executeReport(report)
    expect(result2.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: false,
    })

    assertLog(result2.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.Failure,
    })

    const result3 = await receiver.sendUpdateBehavior(deployer.getSender(), toNano('0.1'), {
      behavior: tr.ReceiverBehavior.Accept,
    })
    expect(result3.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: true,
    })

    //try manual exec
    const gasOverride = toNano('0.05')
    const result4 = await manualExecuteReport(report, gasOverride, true)

    expect(result4.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      value: gasOverride,
      success: true,
    })

    assertLog(result4.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.InProgress,
    })

    assertLog(result4.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.Success,
    })

    assertLog(
      result4.transactions,
      receiver.address,
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
    const message = createTestMessage(1n, 1n, receiver.address) // empty data (Cell.EMPTY)
    await setupAndCommitMessage(message)
    const report = createExecuteReport([message])
    const result = await receiver.sendUpdateBehavior(deployer.getSender(), toNano('0.1'), {
      behavior: tr.ReceiverBehavior.RejectAll,
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: true,
    })

    const result2 = await executeReport(report)
    expect(result2.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: false,
    })

    assertLog(result2.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.Failure,
    })

    const result3 = await receiver.sendUpdateBehavior(deployer.getSender(), toNano('0.1'), {
      behavior: tr.ReceiverBehavior.Accept,
    })
    expect(result3.transactions).toHaveTransaction({
      from: deployer.address,
      to: receiver.address,
      success: true,
    })

    const gasOverride = message.gasLimit - 100n

    const result4 = await manualExecuteReport(report, gasOverride, true)

    expect(result4.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      value: message.gasLimit,
      success: true,
    })

    assertLog(result4.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.InProgress,
    })

    assertLog(result4.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.Success,
    })

    assertLog(
      result4.transactions,
      receiver.address,
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
    const facilityIdVal = await offRamp.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(ofManual.FACILITY_ID))

    const [typeSlice] = await offRamp.getTypeAndVersion()
    const typeStr = typeSlice.loadStringTail()
    expect(typeStr).toBe(ofManual.FACILITY_NAME)

    expect(ofManual.FACILITY_ID).toEqual(facilityId(crc32(ofManual.FACILITY_NAME)))
  })

  it('OffRamp should match error code', async () => {
    const errorCodeVal = await offRamp.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(ofManual.ERROR_CODE))

    expect(ofManual.ERROR_CODE).toEqual(errorCode(crc32(ofManual.FACILITY_NAME)))
  })

  it('Test commit two messages in one root and execute first message with proof', async () => {
    const message1 = createTestMessage(1n, 1n, receiver.address)
    const message2 = createTestMessage(2n, 2n, receiver.address)
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

    const root = createMerkleRoot(1n, 2n, rootBytes)

    await setupOCRConfigs()
    await commitReport([root])

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

    const result = await executeReport(report)

    // First message should be successfully processed
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: of.ExecutionState.Success,
    })
  })

  it('Test commit two messages in one root and execute second message with proof', async () => {
    const message1 = createTestMessage(1n, 1n, receiver.address)
    const message2 = createTestMessage(2n, 2n, receiver.address)
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

    const root = createMerkleRoot(1n, 2n, rootBytes)

    await setupOCRConfigs()
    await commitReport([root])

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

    const result = await executeReport(report)

    // Second message should be successfully processed
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 2n,
      messageId: 2n,
      state: of.ExecutionState.Success,
    })
  })

  it('Test commit two messages in one root and execute both messages sequentially', async () => {
    const message1 = createTestMessage(1n, 1n, receiver.address)
    const message2 = createTestMessage(2n, 2n, receiver.address)
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
    const root = createMerkleRoot(1n, 2n, rootBytes)

    await setupOCRConfigs()
    await commitReport([root])

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

      const result = await executeReport(report)

      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: of.ExecutionState.Success,
      })
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

      const result = await executeReport(report)

      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 2n,
        messageId: 2n,
        state: of.ExecutionState.Success,
      })
    }
  })

  it('Test execute with wrong proof fails', async () => {
    const message1 = createTestMessage(1n, 1n, receiver.address)
    const message2 = createTestMessage(2n, 2n, receiver.address)
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
    const root = createMerkleRoot(1n, 2n, rootBytes)

    await setupOCRConfigs()
    await commitReport([root])

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

    const result = await offRamp.sendOffRampExecute(transmitters[0].getSender(), toNano('0.5'), {
      reportContext: of.ReportContext.create({
        configDigest,
        sequenceBytes: 0x02n,
      }),
      report,
    })

    // The execute call itself should succeed but message verification should fail
    expect(result.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: offRamp.address,
      success: true,
    })

    // Should have a failed transaction (proof verification failure)
    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      success: false,
    })

    // Message should not reach the receiver
    expect(result.transactions).not.toHaveTransaction({
      from: router.address,
      to: receiver.address,
    })
  })

  it('Test commit three messages in one root and execute middle message with proof', async () => {
    const message1 = createTestMessage(1n, 1n, receiver.address)
    const message2 = createTestMessage(2n, 2n, receiver.address)
    const message3 = createTestMessage(3n, 3n, receiver.address)
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

    const root = createMerkleRoot(1n, 3n, rootBytes)

    await setupOCRConfigs()
    await commitReport([root])

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

    const result = await executeReport(report)

    // Middle message should be successfully processed
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 2n,
      messageId: 2n,
      state: of.ExecutionState.Success,
    })
  })

  it('Test commit five messages in one root and execute each individually with proofs', async () => {
    // Create 5 messages
    const messages = [
      createTestMessage(1n, 1n, receiver.address),
      createTestMessage(2n, 2n, receiver.address),
      createTestMessage(3n, 3n, receiver.address),
      createTestMessage(4n, 4n, receiver.address),
      createTestMessage(5n, 5n, receiver.address),
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
    const root = createMerkleRoot(1n, 5n, rootBytes)

    await setupOCRConfigs()
    await commitReport([root])

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

      const result = await executeReport(report)

      // Each message should be successfully processed
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: BigInt(i + 1),
        messageId: BigInt(i + 1),
        state: of.ExecutionState.Success,
      })
    }
  })

  it('Test commit five messages and execute them in non-sequential order', async () => {
    // Create 5 messages
    const messages = [
      createTestMessage(1n, 1n, receiver.address),
      createTestMessage(2n, 2n, receiver.address),
      createTestMessage(3n, 3n, receiver.address),
      createTestMessage(4n, 4n, receiver.address),
      createTestMessage(5n, 5n, receiver.address),
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
    const root = createMerkleRoot(1n, 5n, rootBytes)

    await setupOCRConfigs()
    await commitReport([root])

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

      const result = await executeReport(report)

      // Each message should be successfully processed
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: BigInt(index + 1),
        messageId: BigInt(index + 1),
        state: of.ExecutionState.Success,
      })
    }
  })

  it('cannot commit with minSeqNr smaller than current source chain config', async () => {
    await setupOCRConfig()
    await setupSourceChainConfig()

    // First commit to establish minSeqNr
    const message1 = createTestMessage(1n, 1n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const root1Bytes = generateMessageID(message1, metadataHash)
    const root1 = createMerkleRoot(1n, 10n, root1Bytes)

    await commitReport([root1])

    // Check that minSeqNr is now 11
    const config = await offRamp.getSourceChainConfig(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    expect(config.minSeqNr).toBe(11n)

    // Try to commit with minSeqNr smaller than current (should fail)
    const message2 = createTestMessage(5n, 5n)
    const root2Bytes = generateMessageID(message2, metadataHash)
    const root2 = createMerkleRoot(5n, 15n, root2Bytes) // minSeqNr=5 < 11

    await commitReport(
      [root2],
      toNano('0.5'),
      0x02,
      undefined,
      false,
      of.OffRamp.Errors['Error.InvalidInterval'],
    )
  })

  it('cannot commit with minSeqNr higher than maxSeqNr', async () => {
    await setupOCRConfig()
    await setupSourceChainConfig()

    const message = createTestMessage(1n, 1n)
    const metadataHash = getDefaultMetadataHash(
      ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
    )
    const rootBytes = generateMessageID(message, metadataHash)

    // Create root with minSeqNr > maxSeqNr
    const root = createMerkleRoot(10n, 5n, rootBytes) // minSeqNr=10 > maxSeqNr=5

    await commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRamp.Errors['Error.InvalidInterval'],
    )
  })

  it('test SetDynamicConfig', async () => {
    // owner can call SetDynamicConfig
    const newFeeQuoter = await generateRandomTonAddress()
    const newPermissionlessExecutionThresholdSeconds = BigInt(7200)
    const result = await offRamp.sendOffRampSetDynamicConfig(deployer.getSender(), toNano('0.1'), {
      feeQuoter: newFeeQuoter,
      permissionlessExecutionThresholdSeconds: newPermissionlessExecutionThresholdSeconds,
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })

    // verify changes
    const dynamicConfig = await offRamp.getConfig()
    expect(dynamicConfig.feeQuoter).toEqual(newFeeQuoter)
    expect(dynamicConfig.permissionlessExecutionThresholdSeconds).toBe(
      newPermissionlessExecutionThresholdSeconds,
    )

    // non-owner cannot call SetDynamicConfig
    const other = await blockchain.treasury('other')
    const result2 = await offRamp.sendOffRampSetDynamicConfig(other.getSender(), toNano('0.1'), {
      feeQuoter: newFeeQuoter,
      permissionlessExecutionThresholdSeconds: newPermissionlessExecutionThresholdSeconds,
    })
    expect(result2.transactions).toHaveTransaction({
      from: other.address,
      to: offRamp.address,
      success: false,
    })
  })

  it('test updateDeployables', async () => {
    // owner can update deployables
    const mockMerkleRootCode = beginCell().storeUint(0x12345678, 32).endCell()
    const mockReceiveExecutorCode = beginCell().storeUint(0x87654321, 32).endCell()

    const result = await offRamp.sendOffRampUpdateDeployables(deployer.getSender(), toNano('0.1'), {
      receiveExecutorCode: mockReceiveExecutorCode,
      merkleRootCode: mockMerkleRootCode,
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })

    // verify changes
    const deployables = await offRamp.getDeployableHashes()

    expect(deployables.merkleRoot).toBe(uint8ArrayToBigInt(mockMerkleRootCode.hash()))

    expect(deployables.receiveExecutor).toBe(uint8ArrayToBigInt(mockReceiveExecutorCode.hash()))

    expect(deployables.deployer).toBe(uint8ArrayToBigInt(deployerCode.hash()))

    // non-owner cannot update deployables
    const other = await blockchain.treasury('other')
    const result2 = await offRamp.sendOffRampUpdateDeployables(other.getSender(), toNano('0.1'), {
      receiveExecutorCode: mockReceiveExecutorCode,
      merkleRootCode: mockMerkleRootCode,
    })
    expect(result2.transactions).toHaveTransaction({
      from: other.address,
      to: offRamp.address,
      success: false,
    })
  })

  it('test getAllSourceChainConfigs', async () => {
    await setupSourceChainConfig()
    const result = await offRamp.getAllSourceChainConfigs()
    const expectedSourceChainConfigs = createDefaultUpdateSourceChainConfigs()
    // Compare dictionary entries with expected configs
    expect(result.size).toBe(expectedSourceChainConfigs.length)
    for (const expected of expectedSourceChainConfigs) {
      const actual = result.get(expected.sourceChainSelector)
      expect(actual).toBeDefined()
      expect(actual!).toEqual(expected.config)
    }
  })
  it('price updates are not sent to feequoter if they are empty', async () => {
    await setupOCRConfig()
    const priceUpdates = of.PriceUpdates.create({
      tokenPriceUpdates: [],
      gasPriceUpdates: [],
    })
    const result = await commitReport([], toNano('0.5'), 0x01, priceUpdates)
    expect(result.transactions).not.toHaveTransaction({
      from: offRamp.address,
      to: feeQuoter.address,
    })

    //should send update if only one of the updates is non-empty
    const priceUpdates2 = of.PriceUpdates.create({
      tokenPriceUpdates: [
        of.TokenPriceUpdate.create({
          sourceToken: generateMockTonAddress(),
          usdPerToken: 12345678n,
        }),
      ],
      gasPriceUpdates: [],
    })

    const result2 = await commitReport([], toNano('0.5'), 0x02, priceUpdates2)
    expect(result2.transactions).toHaveTransaction({
      from: offRamp.address,
      to: feeQuoter.address,
    })

    //test with other combination
    const priceUpdates3 = of.PriceUpdates.create({
      tokenPriceUpdates: [],
      gasPriceUpdates: [
        of.GasPriceUpdate.create({
          destChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
          executionGasPrice: 1n,
          dataAvailabilityGasPrice: 1n,
        }),
      ],
    })

    const result3 = await commitReport([], toNano('0.5'), 0x03, priceUpdates3)
    expect(result3.transactions).toHaveTransaction({
      from: offRamp.address,
      to: feeQuoter.address,
      success: true,
    })
  })

  describe('Bounced Message Handling Tests', () => {
    it('should handle RouteMessage bounce from router and emit events', async () => {
      // Create a mock router that will bounce messages
      const wrongRouterAddress = generateMockTonAddress()

      // Update source chain config to use a non-existent router
      const configsWithWrongRouter = createDefaultUpdateSourceChainConfigs({
        router: wrongRouterAddress,
      })

      await setupOCRConfigs()
      await offRamp.sendOffRampUpdateSourceChainConfigs(deployer.getSender(), toNano('0.5'), {
        configs: configsWithWrongRouter,
      })

      // Create and commit a message to a valid receiver
      const message = createTestMessage(1n, 1n, receiver.address)
      const metadataHash = getDefaultMetadataHash(
        ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
      )
      const rootBytes = generateMessageID(message, metadataHash)
      const root = createMerkleRoot(1n, 1n, rootBytes)

      await commitReport([root])

      // Try to execute - the Router_RouteMessage should bounce
      const report = createExecuteReport([message])
      const result = await executeReport(report)

      // The OffRamp should emit ExecutionStateChanged to IN_PROGRESS
      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: of.ExecutionState.InProgress,
      })

      // Should bounce from the non-existent router
      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        to: wrongRouterAddress,
        success: false,
      })

      // Should emit RouteMessageBounced event
      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.RouteMessageBounced, {
        router: wrongRouterAddress,
        execId: expect.any(BigInt),
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: of.ExecutionState.Failure,
      })
    })

    it('should handle Deployable_Initialize bounce and emit events', async () => {
      await setupOCRConfigs()

      // Try committing the same root twice. This should normally never happen because the seqNr
      // would not match, but we can intentionally build a commit report with correct seqNr
      const message1 = createTestMessage(1n, 1n, receiver.address)
      const rootBytes = generateMessageID(
        message1,
        getDefaultMetadataHash(ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001),
      )
      const root = createMerkleRoot(1n, 1n, rootBytes)

      await commitReport([root])

      const root2 = createMerkleRoot(2n, 2n, rootBytes)

      const result = await commitReport([root2])

      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        success: false,
        to: merkleRootAddress(root2),
      })

      expect(result.transactions).toHaveTransaction({
        from: merkleRootAddress(root2),
        success: true,
        to: offRamp.address,
      })

      assertLog(
        result.transactions,
        offRamp.address,
        CCIPLogs.LogTypes.DeployableInitializeBounced,
        {
          deployableAddress: merkleRootAddress(root2),
        },
      )
    })

    it('should handle ReceiveExecutor_InitExecute bounce and emit events', async () => {
      // First, commit report with a valid message
      const message1 = createTestMessage(1n, 1n, receiver.address)
      await setupAndCommitMessage(message1)

      // Update receiveExecutorCode to bad code that will cause InitExecute to bounce
      const badReceiveExecutorCode = beginCell().storeUint(0x88888888, 32).endCell()
      await offRamp.sendOffRampUpdateDeployables(deployer.getSender(), toNano('0.1'), {
        receiveExecutorCode: badReceiveExecutorCode,
        merkleRootCode: merkleRootCodeRaw,
      })

      const report = createExecuteReport([message1])
      // Execute the second message
      const result = await executeReport(report)

      // Should emit IN_PROGRESS
      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: of.ExecutionState.InProgress,
      })

      // InitExecute should fail
      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        success: false,
      })

      // Should emit ReceiveExecutorInitExecuteBounced
      assertLog(
        result.transactions,
        offRamp.address,
        CCIPLogs.LogTypes.ReceiveExecutorInitExecuteBounced,
        {
          receiveExecutor: expect.any(Address),
          root: expect.any(Address),
          sequenceNumber: 1n,
        },
      )

      // Should emit ExecutionStateChanged: FAILURE
      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: of.ExecutionState.Failure,
      })
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      const testSuitePrefix = 'offramp_suite'
      await coverage.generateCoverageArtifacts(blockchain, testSuitePrefix, [
        {
          code: offRampCodeRaw,
          name: 'offramp',
        },
        {
          code: routerCodeRaw,
          name: 'router',
        },
        {
          code: feeQuoterCodeRaw,
          name: 'feequoter',
        },
        {
          code: merkleRootCodeRaw,
          name: 'merkleroot',
        },
        {
          code: receiveExecutorCodeRaw,
          name: 'receive_executor',
        },
      ])
    }
  })
})

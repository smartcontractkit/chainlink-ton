import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, contractAddress, Dictionary, StateInit, toNano } from '@ton/core'
import { compile } from '@ton/blueprint'
import { KeyPair, sha256_sync } from '@ton/crypto'
import '@ton/test-utils'
import { crc32 } from 'zlib'

import { assertLog, expectFailedTransaction, expectSuccessfulTransaction } from '../Logs'
import {
  bigIntToBuffer,
  bigIntToUint8Array,
  generateEd25519KeyPair,
  generateMockTonAddress,
  generateRandomContractId,
  generateRandomTonAddress,
  uint8ArrayToBigInt,
  WRAPPED_NATIVE,
} from '../../src/utils'
import { setupTestFeeQuoter } from './helpers/SetUp'
import { MerkleHelper } from '../lib/merkle_proof/helpers/MerkleMultiProofHelper'
import * as coverage from '../coverage/coverage'
import { errorCode, facilityId } from '../../wrappers/utils'

import { newWithdrawableSpec } from '../lib/funding/WithdrawableSpec'
import * as UpgradeableSpec from '../lib/versioning/UpgradeableSpec'
import * as TypeAndVersionSpec from '../lib/versioning/TypeAndVersionSpec'
import * as ownable2StepSpec from '../../tests/lib/access/Ownable2StepSpec'
import * as OCR3Logs from '../../wrappers/libraries/ocr/Logs'
import * as CCIPLogs from '../../wrappers/ccip/Logs'
import * as of from '../../wrappers/ccip/OffRamp'
import * as rx from '../../wrappers/ccip/ReceiveExecutor'
import * as mr from '../../wrappers/ccip/MerkleRoot'
import * as fq from '../../wrappers/ccip/FeeQuoter'
import * as ownable2step from '../../wrappers/libraries/access/Ownable2Step'
import * as ocr from '../../wrappers/libraries/ocr/MultiOCR3Base'
import * as tr from '../../wrappers/examples/Receiver'
import * as rt from '../../wrappers/ccip/Router'
import * as deployable from '../../wrappers/libraries/Deployable'
import * as NameSpace from '../../wrappers/ccip/NameSpace'
import { contractCode } from '../../wrappers/codeLoader'

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123n
const CHAINSEL_EVM_TEST_90000002 = 5548718428018410741n
const CHAINSEL_TON = 13879075125137744094n
const EVM_SENDER_ADDRESS_TEST = 0x1a5fdbc891c5d4e6ad68064ae45d43146d4f9f3an
const EVM_ONRAMP_ADDRESS_TEST = 0x111111c891c5d4e6ad68064ae45d43146d4f9f3an
const LEAF_DOMAIN_SEPARATOR = beginCell().storeUint(0, 256).asSlice()
const PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS = 60

const createSignatures = (
  signerList: KeyPair[],
  hash: Buffer<ArrayBufferLike>,
): ocr.SignatureEd25519[] => {
  return signerList.map((signer) => ocr.createSignature(signer, hash))
}

const getMerkleRootID = (root: bigint) => {
  return beginCell().storeUint(root, 256)
}

const getMetadataHash = (sourceChainSelector: bigint) => {
  const hash = beginCell()
    .storeUint(uint8ArrayToBigInt(sha256_sync('Any2TVMMessageHashV1')), 256)
    .storeUint(sourceChainSelector, 64)
    .storeUint(CHAINSEL_TON, 64)
    .storeRef(
      beginCell()
        .storeUint(bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST).byteLength, 8)
        .storeBuffer(
          bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST),
          bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST).byteLength,
        )
        .endCell(),
    )
    .endCell()
    .hash()

  return hash
}

export function generateMessageId(message: of.Any2TVMRampMessage, metadataHash: bigint) {
  return (
    beginCell()
      .storeSlice(LEAF_DOMAIN_SEPARATOR)
      .storeUint(metadataHash, 256)
      //header
      .storeRef(
        beginCell()
          .storeUint(message.header.messageId, 256)
          .storeAddress(message.receiver)
          .storeUint(message.header.sequenceNumber, 64)
          .storeCoins(message.gasLimit)
          .storeUint(message.header.nonce, 64)
          .endCell(),
      )
      //message sender
      .storeRef(
        beginCell()
          .storeUint(message.sender.byteLength, 8)
          .storeBuffer(message.sender, message.sender.byteLength)
          .endCell(),
      )
      //rest of the message
      .storeRef(message.data)
      .storeMaybeRef(message.tokenAmounts)
      .endCell()
      .hash()
  )
}

async function deployOffRampContract(
  blockchain: Blockchain,
  owner: SandboxContract<TreasuryContract>,
  code?: Cell,
) {
  let data: of.OffRampStorage = {
    id: generateRandomContractId(),
    ownable: {
      owner: owner.address,
      pendingOwner: null,
    },
    deployables: {
      deployerCode: beginCell().endCell(),
      merkleRootCode: beginCell().endCell(),
      receiveExecutorCode: beginCell().endCell(),
    },
    feeQuoter: owner.address, // placeholder
    router: owner.address, // used to determine who can send RMN updates
    chainSelector: CHAINSEL_TON,
    permissionlessExecutionThresholdSeconds: PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS,
    latestPriceSequenceNumber: 0n,
  }

  if (!code) {
    code = await of.OffRamp.code()
  }

  const contract = blockchain.openContract(of.OffRamp.createFromConfig(data, code))
  const deployer = await blockchain.treasury('deployer')
  await contract.sendDeploy(deployer.getSender(), toNano('0.05'))
  return contract
}

describe('OffRamp - TypeAndVersion Tests', () => {
  const currentVersionSpec = TypeAndVersionSpec.newInstance({
    type: of.OffRamp.type(),
    version: of.OffRamp.version(),
    deployContract: deployOffRampContract,
  })
  currentVersionSpec.run([
    {
      code: 'OffRamp',
      name: 'offramp',
    },
  ])
})

describe('OffRamp - Withdrawable Tests', () => {
  const withdrawableSpec = newWithdrawableSpec({
    getCode: () => compile('OffRamp'),
    ContractConstructor: of.OffRamp,
    ownershipErrorCode: ownable2step.Errors.OnlyCallableByOwner,
    deployContract: deployOffRampContract,
  })
  withdrawableSpec.run([
    {
      code: 'OffRamp',
      name: 'offramp',
    },
  ])
})

describe('OffRamp - Upgrade Tests', () => {
  class OffRamp extends of.OffRamp {}
  class OffRampPrev extends of.OffRamp {
    static code(): Promise<Cell> {
      return contractCode.ccip.release_1_6_0('OffRamp')
    }
  }

  const upgradeSpec = UpgradeableSpec.newUpgradeSpec({
    contractType: OffRampPrev.type(),
    prevVersion: of.OFFRAMP_CONTRACT_VERSION_PREV,
    currentVersion: OffRamp.version(),
    getPrevCode: () => OffRampPrev.code(),
    getCurrentCode: () => OffRamp.code(),
    CurrentVersionConstructor: OffRamp,
    upgradeValue: toNano('0.05'),
    deployPrevContract: async (blockchain, owner) =>
      deployOffRampContract(blockchain, owner, await OffRampPrev.code()),
  })
  upgradeSpec.run([
    {
      code: 'OffRamp',
      name: 'offramp',
    },
  ])
})

describe('OffRamp - Current Version Tests', () => {
  const currentVersionSpec = UpgradeableSpec.newCurrentVersionSpec({
    contractType: of.OffRamp.type(),
    currentVersion: of.OffRamp.version(),
    getCurrentCode: () => of.OffRamp.code(),
    CurrentVersionConstructor: of.OffRamp,
    deployCurrentContract: deployOffRampContract,
  })
  currentVersionSpec.run('offramp')
})

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

  const createDefaultOCRConfig = (overrides = {}) => ({
    value: toNano('100'),
    configDigest,
    ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
    bigF: 1,
    isSignatureVerificationEnabled: true,
    signers: signersPublicKeys,
    transmitters: transmitters.map((t) => t.address),
    ...overrides,
  })

  const createDefaultUpdateSourceChainConfigs = (overrides = {}): of.UpdateSourceChainConfig[] => [
    {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      config: {
        router: router.address,
        isEnabled: true,
        minSeqNr: 1n,
        isRMNVerificationDisabled: true,
        onRamp: bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST),
        ...overrides,
      },
    },
    {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000002,
      config: {
        router: router.address,
        isEnabled: true,
        minSeqNr: 1n,
        isRMNVerificationDisabled: true,
        onRamp: bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST),
        ...overrides,
      },
    },
  ]

  const createTestMessage = (
    sequenceNumber = 1n,
    messageId = 1n,
    receiverAddress = generateMockTonAddress(),
    data: Cell = Cell.EMPTY,
  ): of.Any2TVMRampMessage => {
    const header: of.RampMessageHeader = {
      messageId,
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      destChainSelector: CHAINSEL_TON,
      sequenceNumber,
      nonce: 0n,
    }

    return {
      header,
      sender: bigIntToBuffer(EVM_SENDER_ADDRESS_TEST),
      data: data,
      receiver: receiverAddress,
      gasLimit: toNano('0.03'), // 200_000_000 nanotons
    }
  }

  const createMerkleRoot = (minSeqNr: bigint, maxSeqNr: bigint, merkleRootBytes: bigint) => ({
    sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
    onRampAddress: bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST),
    minSeqNr,
    maxSeqNr,
    merkleRoot: merkleRootBytes,
  })

  const generateMerkleRootBytes = (
    messages: of.Any2TVMRampMessage[],
    metadataHash: bigint,
  ): bigint => {
    let hashedMessages = messages.map((msg) => {
      return uint8ArrayToBigInt(generateMessageId(msg, metadataHash))
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
    ocrPluginType = ocr.OCR3_PLUGIN_TYPE_COMMIT,
    overrides: any = {},
  ) => {
    const result = await offRamp.sendSetOCR3Config(
      deployer.getSender(),
      createDefaultOCRConfig({ ocrPluginType, ...overrides }),
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

  const setupSourceChainConfig = async (overrides = {}, isInitialSetup = true) => {
    const configs = createDefaultUpdateSourceChainConfigs({ ...overrides })
    const result = await offRamp.sendUpdateSourceChainConfigs(deployer.getSender(), {
      value: toNano('0.5'),
      configs: configs,
    })
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
        config: { ...config.config, ...overrides, minSeqNr: expect.anything() },
      })
    }

    return result
  }

  // Helper function to test commit report flow
  const commitReport = async (
    merkleRoots: of.MerkleRoot[],
    value: bigint = toNano('0.5'),
    sequenceBytes = 0x01,
    priceUpdates: of.PriceUpdates | undefined = undefined,
    expectSuccess = true,
    exitCode = 0,
  ) => {
    const report: of.CommitReport = { merkleRoots, priceUpdates }
    const reportContext: ocr.ReportContext = { configDigest, padding: 0n, sequenceBytes }
    const signatures = createSignatures(
      [signers[0], signers[1]],
      ocr.hashReport(of.builder.data.commitReport.encode(report).endCell(), reportContext),
    )

    const result = await offRamp.sendCommit(transmitters[0].getSender(), {
      value,
      reportContext,
      report,
      signatures,
    })
    if (expectSuccess) {
      expectSuccessfulTransaction(result, transmitters[0].address, offRamp.address)

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.CommitReportAccepted, {
        merkleRoot: merkleRoots[0],
        priceUpdates: priceUpdates,
      })
    } else {
      expectFailedTransaction(result, transmitters[0].address, offRamp.address, exitCode)
    }

    return result
  }

  //TODO: When we test for token transfers this will take more parameters
  const createExecuteReport = (
    messages: of.Any2TVMRampMessage[],
    sourceChainSelector = CHAINSEL_EVM_TEST_90000001,
  ) => ({
    sourceChainSelector,
    messages,
    offchainTokenData: [],
    proofs: [],
    proofFlagBits: 0n,
  })

  // Helper function to test execute report flow
  const executeReport = async (
    report: of.ExecutionReport,
    sequenceBytes = 0x02,
    expectSuccess = true,
  ) => {
    const result = await offRamp.sendExecute(transmitters[0].getSender(), {
      value: toNano('0.2'),
      reportContext: { configDigest, padding: 0n, sequenceBytes },
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
    const result = await offRamp.sendManualExecute(transmitters[0].getSender(), {
      value: toNano('0.5'),
      report,
      gasOverride,
    })

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
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
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
    receiveExecutorCodeRaw = await contractCode.ccip.local('ReceiveExecutor')

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

      let data: of.OffRampStorage = {
        id: generateRandomContractId(),
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        deployables: {
          deployerCode: deployerCode,
          merkleRootCode: merkleRootCode,
          receiveExecutorCode: receiveExecutorCode,
        },
        feeQuoter: feeQuoter.address,
        router: deployer.address, // used to validate who can configure RMN
        chainSelector: CHAINSEL_TON,
        permissionlessExecutionThresholdSeconds: 60,
        latestPriceSequenceNumber: 0n,
      }

      offRamp = blockchain.openContract(of.OffRamp.createFromConfig(data, code))

      let result = await offRamp.sendDeploy(deployer.getSender(), toNano('0.05'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: offRamp.address,
        deploy: true,
        success: true,
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
      const code = await compile('Router')
      let data: rt.Storage = {
        id: generateRandomContractId(),
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        wrappedNative: WRAPPED_NATIVE,
        onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
        offRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
      }

      router = blockchain.openContract(rt.Router.createFromConfig(data, code))

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
            sourceChainSelectors: [CHAINSEL_EVM_TEST_90000001],
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
      let code = await compile('ccip.test.receiver')
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
  }, 60_000) // setup can take a while, since we deploy contracts

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
      const result = await offRamp.sendSetOCR3Config(
        deployer.getSender(),
        createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
          isSignatureVerificationEnabled: false, // Invalid for commit
        }),
      )

      expectFailedTransaction(
        result,
        deployer.address,
        offRamp.address,
        of.OffRampError.SignatureVerificationRequiredInCommitPlugin,
      )
    })

    it('should reject execute plugin config with signature verification', async () => {
      const result = await offRamp.sendSetOCR3Config(
        deployer.getSender(),
        createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_EXECUTE,
          isSignatureVerificationEnabled: true, // Invalid for execute
          signers: signersPublicKeys,
        }),
      )

      expectFailedTransaction(
        result,
        deployer.address,
        offRamp.address,
        of.OffRampError.SignatureVerificationNotAllowedInExecutionPlugin,
      )
    })

    it('should accept commit plugin config with signature verification enabled', async () => {
      const result = await offRamp.sendSetOCR3Config(
        deployer.getSender(),
        createDefaultOCRConfig({
          ocrPluginType: ocr.OCR3_PLUGIN_TYPE_COMMIT,
          isSignatureVerificationEnabled: true, // Valid
        }),
      )

      expectSuccessfulTransaction(result, deployer.address, offRamp.address)
    })

    it('should accept execute plugin config without signature verification', async () => {
      const result = await offRamp.sendSetOCR3Config(
        deployer.getSender(),
        createDefaultOCRConfig({
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
      const priceUpdates: of.PriceUpdates = {
        tokenPriceUpdates: [{ sourceToken, usdPerToken: 100n }],
        gasPriceUpdates: [],
      }

      // Commit with sequence 0x10
      await commitReport([], toNano('0.5'), 0x10, priceUpdates)
      let latestSeq = await offRamp.getLatestPriceSequenceNumber()
      expect(latestSeq).toBe(0x10n)

      // Change commit config (new config digest)
      const newConfigDigest = 0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789n
      const result = await offRamp.sendSetOCR3Config(
        deployer.getSender(),
        createDefaultOCRConfig({
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
      const priceUpdates: of.PriceUpdates = {
        tokenPriceUpdates: [{ sourceToken, usdPerToken: 100n }],
        gasPriceUpdates: [],
      }

      await commitReport([], toNano('0.5'), 0x10, priceUpdates)
      let latestSeq = await offRamp.getLatestPriceSequenceNumber()
      expect(latestSeq).toBe(0x10n)

      // Change execute config (not commit)
      const newConfigDigest = 0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789n
      const result = await offRamp.sendSetOCR3Config(
        deployer.getSender(),
        createDefaultOCRConfig({
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
    const report: of.CommitReport = { merkleRoots: [] }
    const reportContext: ocr.ReportContext = { configDigest, padding: 0n, sequenceBytes: 0x01 }
    const signatures = createSignatures(
      [signers[0], signers[1]],
      ocr.hashReport(of.builder.data.commitReport.encode(report).endCell(), reportContext),
    )

    const result = await offRamp.sendCommit(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext,
      report,
      signatures,
    })

    expectFailedTransaction(
      result,
      transmitters[0].address,
      offRamp.address,
      of.OffRampError.EmptyCommitReport,
    )
  })

  it('Test commit fails when source chain is cursed', async () => {
    const message = createTestMessage()
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupOCRConfig()
    await setupSourceChainConfig()

    // Curse source chain
    const curseResult = await offRamp.sendUpdateCursedSubjects(deployer.getSender(), {
      value: toNano('0.5'),
      subjects: [CHAINSEL_EVM_TEST_90000001],
    })
    expect(curseResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })
    let cursedSubjects = await offRamp.getCursedSubjects()
    expect(cursedSubjects).toEqual([CHAINSEL_EVM_TEST_90000001])

    // Attempt to commit - should fail with SubjectCursed
    await commitReport([root], toNano('0.5'), 0x01, undefined, false, of.OffRampError.SubjectCursed)

    // Uncurse source chain
    const uncurseResult = await offRamp.sendUpdateCursedSubjects(deployer.getSender(), {
      value: toNano('0.5'),
      subjects: [],
    })
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
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupOCRConfig()
    await setupSourceChainConfig()

    // Curse all lanes
    const curseResult = await offRamp.sendUpdateCursedSubjects(deployer.getSender(), {
      value: toNano('0.5'),
      subjects: [rt.RMNREMOTE_GLOBAL_CURSE_SUBJECT],
    })
    expect(curseResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })
    let cursedSubjects = await offRamp.getCursedSubjects()
    expect(cursedSubjects).toEqual([rt.RMNREMOTE_GLOBAL_CURSE_SUBJECT])

    // Attempt to commit - should fail with SubjectCursed
    await commitReport([root], toNano('0.5'), 0x01, undefined, false, of.OffRampError.SubjectCursed)

    // Uncurse all lanes
    const uncurseResult = await offRamp.sendUpdateCursedSubjects(deployer.getSender(), {
      value: toNano('0.5'),
      subjects: [],
    })
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
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))

    // Create root with wrong onRamp address
    const wrongOnRampAddress = 0x222222c891c5d4e6ad68064ae45d43146d4f9f3an
    const root = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      onRampAddress: bigIntToBuffer(wrongOnRampAddress),
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
      of.OffRampError.OnRampAddressMismatch,
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
      of.OffRampError.MerkleRootCannotBeZero,
    )
  })

  it('Test commit with one merkle root for one empty message', async () => {
    const message = createTestMessage()
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
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
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
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
      of.OffRampError.BatchingNotSupported,
    )
  })

  it('Test commit report fails if source chain is not enabled', async () => {
    const message = createTestMessage()
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupOCRConfig()
    await setupSourceChainConfig({ isEnabled: false }) // disabled source chain

    const report: of.CommitReport = { merkleRoots: [root] }
    const reportContext: ocr.ReportContext = {
      configDigest,
      padding: 0n,
      sequenceBytes: 0x01,
    }
    const signatures = createSignatures(
      [signers[0], signers[1]],
      ocr.hashReport(of.builder.data.commitReport.encode(report).endCell(), reportContext),
    )

    const result = await offRamp.sendCommit(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext,
      report,
      signatures,
    })

    expectFailedTransaction(
      result,
      transmitters[0].address,
      offRamp.address,
      of.OffRampError.SourceChainNotEnabled,
    )
  })

  it('Test commit with more than 64 messages fails', async () => {
    await setupOCRConfig()
    await setupSourceChainConfig()

    const message = createTestMessage(1n, 1n)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))

    // Commit with more than 64 messages should fail
    const root = createMerkleRoot(1n, 65n, rootBytes)

    await commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRampError.TooManyMessagesInReport,
    )

    // Commit with exactly 64 messages should succeed
    const root2 = createMerkleRoot(1n, 64n, rootBytes)
    await commitReport([root2], toNano('0.5'), 0x02, undefined)
  })

  it('Test commit with two merkle roots with one message each', async () => {
    const message1 = createTestMessage(1n, 1n)
    const message2 = createTestMessage(2n, 2n)

    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const root1Bytes = uint8ArrayToBigInt(generateMessageId(message1, metadataHash))
    const root2Bytes = uint8ArrayToBigInt(generateMessageId(message2, metadataHash))

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

  it('Test generateMessageId hash compatibility with Go', () => {
    // Create the exact same message as in Go test for cross-language compatibility
    const rampMessageHeader: of.RampMessageHeader = {
      messageId: 1n,
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      destChainSelector: CHAINSEL_TON,
      sequenceNumber: 1n,
      nonce: 0n,
    }

    const message: of.Any2TVMRampMessage = {
      header: rampMessageHeader,
      sender: Buffer.from(bigIntToUint8Array(EVM_SENDER_ADDRESS_TEST)),
      data: beginCell().endCell(),
      receiver: Address.parse('EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2'),
      gasLimit: 100000000n,
      tokenAmounts: undefined,
    }

    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const messageIdHash = generateMessageId(message, metadataHash)
    const messageId = uint8ArrayToBigInt(messageIdHash)

    // Uncomment to log the hash to update Go test
    //const hashHex = messageId.toString(16).padStart(64, '0')
    //console.log('Expected hash for Go test:', hashHex)

    // Basic validation that we got a valid hash
    expect(messageId).toBe(0xce60f1962af3c7c7f9d3e434dea13530564dbff46704d628ff4b2206bbc93289n)

    // Uncomment to log the raw bytes of ramp message for Go test
    // console.log(beginCell().storeBuilder(or.Any2TVMRampMessageToBuilder(message)).endCell().toBoc().toString('hex'))

    // Uncomment to log the raw bytes of execute report for Go test
    // const report = createExecuteReport([message])
    // console.log(beginCell().storeBuilder(or.ExecutionReportToBuilder(report)).endCell().toBoc().toString('hex'))
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
    const executeReport: of.ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message],
      offchainTokenData: [],
      proofs: [],
      proofFlagBits: 0n,
    }

    const executeResult = await offRamp.sendExecute(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext: { configDigest, padding: 0n, sequenceBytes: 0x02 },
      report: executeReport,
    })

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

    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const differentRootBytes = uint8ArrayToBigInt(generateMessageId(differentMessage, metadataHash))
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
    const executeReport: of.ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message],
      offchainTokenData: [],
      proofs: [],
      proofFlagBits: 0n,
    }

    const executeResult = await offRamp.sendExecute(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext: { configDigest, padding: 0n, sequenceBytes: 0x02 },
      report: executeReport,
    })

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
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
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
    const executeReport: of.ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message],
      offchainTokenData: [],
      proofs: [],
      proofFlagBits: 0n,
    }

    // First execution should succeed
    const firstExecuteResult = await offRamp.sendExecute(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext: { configDigest, padding: 0n, sequenceBytes: 0x02 },
      report: executeReport,
    })

    expect(firstExecuteResult.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
    })

    // Second execution with the same report should fail
    const secondExecuteResult = await offRamp.sendExecute(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext: { configDigest, padding: 0n, sequenceBytes: 0x02 },
      report: executeReport,
    })

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
    await executeReportExpectingFailure(report, of.OffRampError.EmptyExecutionReport)
  })

  it('Test execute fails when message destChainSelector is wrong', async () => {
    const wrongDestMessage = createTestMessage(1n, 1n, receiver.address)
    wrongDestMessage.header.destChainSelector = 999999n

    await setupAndCommitMessage(wrongDestMessage)
    const report = createExecuteReport([wrongDestMessage])
    await executeReportExpectingFailure(report, of.OffRampError.InvalidMessageDestChainSelector)
  })

  it('Test execute fails when message sourceChainSelector mismatches report', async () => {
    const wrongSourceMessage = createTestMessage(1n, 1n, receiver.address)
    wrongSourceMessage.header.sourceChainSelector = 888888n

    await setupAndCommitMessage(wrongSourceMessage)
    const report = createExecuteReport([wrongSourceMessage], CHAINSEL_EVM_TEST_90000001) // Different from message
    await executeReportExpectingFailure(report, of.OffRampError.SourceChainSelectorMismatch)
  })

  it('Test execute fails when source chain is disabled', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)

    // Setup and commit with enabled chain
    await setupOCRConfigs()
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)
    await commitReport([root])

    // Disable source chain for execution
    await setupSourceChainConfig({ isEnabled: false }, false)

    const report = createExecuteReport([message])
    await executeReportExpectingFailure(report, of.OffRampError.SourceChainNotEnabled)
  })

  it('Test execute fails when source chain is cursed', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)

    // Setup and commit with enabled chain
    await setupOCRConfigs()
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)
    await commitReport([root])

    // Curse source chain
    let result = await offRamp.sendUpdateCursedSubjects(deployer.getSender(), {
      value: toNano('0.5'),
      subjects: [CHAINSEL_EVM_TEST_90000001],
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })

    const report = createExecuteReport([message])
    await executeReportExpectingFailure(report, of.OffRampError.SubjectCursed)

    // Uncurse source chain
    result = await offRamp.sendUpdateCursedSubjects(deployer.getSender(), {
      value: toNano('0.5'),
      subjects: [],
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
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)
    await commitReport([root])

    // Curse source chain
    let result = await offRamp.sendUpdateCursedSubjects(deployer.getSender(), {
      value: toNano('0.5'),
      subjects: [rt.RMNREMOTE_GLOBAL_CURSE_SUBJECT],
    })
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })

    const report = createExecuteReport([message])
    await executeReportExpectingFailure(report, of.OffRampError.SubjectCursed)

    // Uncurse source chain
    result = await offRamp.sendUpdateCursedSubjects(deployer.getSender(), {
      value: toNano('0.5'),
      subjects: [],
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
    await executeReportExpectingFailure(report, of.OffRampError.SourceChainNotEnabled)
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
        message: {
          messageId: message.header.messageId,
          sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
          sender: message.sender,
          data: message.data,
        },
      },
    )
    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      messageId: message.header.messageId,
      state: BigInt(of.ExecutionState.InProgress),
    })
    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      messageId: message.header.messageId,
      state: BigInt(of.ExecutionState.Success),
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
      state: BigInt(of.ExecutionState.InProgress),
    })
    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      messageId: message.header.messageId,
      state: BigInt(of.ExecutionState.Failure),
    })
  })

  it('Test cannot call dispatch directly', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))

    const messageIdSlice = beginCell()
      .storeUint(uint8ArrayToBigInt(generateMessageId(message, metadataHash)), 256)
      .asSlice()
    const execId = messageIdSlice.loadUintBig(192)

    const result = await offRamp.sendDispatchValidated(deployer.getSender(), {
      value: toNano('0.5'),
      message: message,
      execId: execId,
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: false,
      exitCode: of.OffRampError.MessageNotFromOwnedContract,
    })
  })

  it('Can commit with no roots and only price updates', async () => {
    await setupOCRConfig()
    const sourceToken = generateMockTonAddress()
    const priceUpdates: of.PriceUpdates = {
      tokenPriceUpdates: [
        {
          sourceToken,
          usdPerToken: 1n,
        },
      ],
      gasPriceUpdates: [
        {
          destChainSelector: CHAINSEL_EVM_TEST_90000001,
          executionGasPrice: 1n,
          dataAvailabilityGasPrice: 1n,
        },
      ],
    }
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
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)

    // Create price updates
    const sourceToken = generateMockTonAddress()
    const priceUpdates: of.PriceUpdates = {
      tokenPriceUpdates: [
        {
          sourceToken,
          usdPerToken: 1n,
        },
      ],
      gasPriceUpdates: [
        {
          destChainSelector: CHAINSEL_EVM_TEST_90000001,
          executionGasPrice: 1n,
          dataAvailabilityGasPrice: 1n,
        },
      ],
    }

    const result = await commitReport([root], toNano('0.5'), 0x01, priceUpdates)
  })

  it('Test price update sequence number increases with OCR sequence', async () => {
    await setupOCRConfig()

    const sourceToken = generateMockTonAddress()
    const priceUpdates: of.PriceUpdates = {
      tokenPriceUpdates: [
        {
          sourceToken,
          usdPerToken: 100n,
        },
      ],
      gasPriceUpdates: [],
    }

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
    const priceUpdates: of.PriceUpdates = {
      tokenPriceUpdates: [
        {
          sourceToken,
          usdPerToken: 100n,
        },
      ],
      gasPriceUpdates: [],
    }

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
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
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
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const root1Bytes = uint8ArrayToBigInt(generateMessageId(message1, metadataHash))
    const root1 = createMerkleRoot(1n, 5n, root1Bytes) // maxSeqNr = 5

    await commitReport([root1])

    // Check that minSeqNr is now 6 (maxSeqNr + 1)
    const config1 = await offRamp.getSourceChainConfig(CHAINSEL_EVM_TEST_90000001)
    expect(config1.minSeqNr).toBe(6n)

    // Second commit with minSeqNr=6, maxSeqNr=10
    const message2 = createTestMessage(6n, 6n)
    const root2Bytes = uint8ArrayToBigInt(generateMessageId(message2, metadataHash))
    const root2 = createMerkleRoot(6n, 10n, root2Bytes) // maxSeqNr = 10

    await commitReport([root2])

    // Check that minSeqNr is now 11 (maxSeqNr + 1)
    const config2 = await offRamp.getSourceChainConfig(CHAINSEL_EVM_TEST_90000001)
    expect(config2.minSeqNr).toBe(11n)
    expect(uint8ArrayToBigInt(config2.onRamp).toString(16)).toBe(
      EVM_ONRAMP_ADDRESS_TEST.toString(16),
    )
  })

  it('Test commit with large sequence number gap', async () => {
    await setupOCRConfig()
    await setupSourceChainConfig()

    // Commit with a large gap: minSeqNr=1, maxSeqNr=100
    const message = createTestMessage(1n, 1n)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 10n, rootBytes)

    const value = toNano('1')
    await commitReport([root], value)

    // minSeqNr should jump to 101
    const config = await offRamp.getSourceChainConfig(CHAINSEL_EVM_TEST_90000001)
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
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: BigInt(of.ExecutionState.InProgress),
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: BigInt(of.ExecutionState.Success),
    })

    assertLog(
      result.transactions,
      receiver.address,
      CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
      {
        message: {
          messageId: message.header.messageId,
          sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
          sender: message.sender,
          data: message.data,
        },
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
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: BigInt(of.ExecutionState.InProgress),
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: BigInt(of.ExecutionState.Success),
    })

    assertLog(
      result.transactions,
      receiver.address,
      CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
      {
        message: {
          messageId: message.header.messageId,
          sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
          sender: message.sender,
          data: message.data,
        },
      },
    )
  })

  it('Test receiver rejects message from wrong offRamp and emits ExecutionStateChanged: Failure', async () => {
    // Deploy a receiver with WRONG offRamp address - it will reject messages from the real offRamp
    let code = await compile('ccip.test.receiver')
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
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: BigInt(of.ExecutionState.InProgress),
      },
    )

    // Should emit FAILURE after bounce
    assertLog(
      executeResult.transactions,
      offRamp.address,
      CCIPLogs.LogTypes.ExecutionStateChanged,
      {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: BigInt(of.ExecutionState.Failure),
      },
    )
  })

  it('Test commit two messages in a single root', async () => {
    const message1 = createTestMessage(1n, 1n)
    const message2 = createTestMessage(2n, 2n)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
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
    warpTime(PERMISSIONLESS_EXECUTION_THRESHOLD_SECONDS)

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
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: BigInt(of.ExecutionState.InProgress),
      },
    )

    assertLog(
      manualExecThirdAttempt.transactions,
      offRamp.address,
      CCIPLogs.LogTypes.ExecutionStateChanged,
      {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: BigInt(of.ExecutionState.Success),
      },
    )

    assertLog(
      manualExecThirdAttempt.transactions,
      receiver.address,
      CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
      {
        message: {
          messageId: message.header.messageId,
          sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
          sender: message.sender,
          data: message.data,
        },
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
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: BigInt(of.ExecutionState.Failure),
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
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: BigInt(of.ExecutionState.InProgress),
    })

    assertLog(result4.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: BigInt(of.ExecutionState.Success),
    })

    assertLog(
      result4.transactions,
      receiver.address,
      CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
      {
        message: {
          messageId: message.header.messageId,
          sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
          sender: message.sender,
          data: message.data,
        },
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
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: BigInt(of.ExecutionState.Failure),
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
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: BigInt(of.ExecutionState.InProgress),
    })

    assertLog(result4.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: BigInt(of.ExecutionState.Success),
    })

    assertLog(
      result4.transactions,
      receiver.address,
      CCIPLogs.LogTypes.ReceiverCCIPMessageReceived,
      {
        message: {
          messageId: message.header.messageId,
          sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
          sender: message.sender,
          data: message.data,
        },
      },
    )
  })

  it('OffRamp should match facility name and ID', async () => {
    const facilityIdVal = await offRamp.getFacilityId()
    expect(facilityIdVal).toBe(BigInt(of.FACILITY_ID))

    const { type } = await offRamp.getTypeAndVersion()
    expect(type).toBe(of.FACILITY_NAME)

    expect(of.FACILITY_ID).toEqual(facilityId(crc32(of.FACILITY_NAME)))
  })

  it('OffRamp should match error code', async () => {
    const errorCodeVal = await offRamp.getErrorCode(0n)
    expect(errorCodeVal).toBe(BigInt(of.ERROR_CODE))

    expect(of.ERROR_CODE).toEqual(errorCode(crc32(of.FACILITY_NAME)))
  })

  it('Test commit two messages in one root and execute first message with proof', async () => {
    const message1 = createTestMessage(1n, 1n, receiver.address)
    const message2 = createTestMessage(2n, 2n, receiver.address)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))

    // Generate message IDs
    const messageId1 = uint8ArrayToBigInt(generateMessageId(message1, metadataHash))
    const messageId2 = uint8ArrayToBigInt(generateMessageId(message2, metadataHash))

    // Create merkle tree with both messages
    const merkleHelper = new MerkleHelper()

    const { proof, root: rootBytes } = merkleHelper.createTreeAndProve(
      [messageId1, messageId2],
      [0], // Prove first message
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
    const report: of.ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message1],
      offchainTokenData: [],
      proofs: proof.hashes,
      proofFlagBits,
    }

    const result = await executeReport(report)

    // First message should be successfully processed
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: BigInt(of.ExecutionState.Success),
    })
  })

  it('Test commit two messages in one root and execute second message with proof', async () => {
    const message1 = createTestMessage(1n, 1n, receiver.address)
    const message2 = createTestMessage(2n, 2n, receiver.address)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))

    // Generate message IDs
    const messageId1 = uint8ArrayToBigInt(generateMessageId(message1, metadataHash))
    const messageId2 = uint8ArrayToBigInt(generateMessageId(message2, metadataHash))

    // Create merkle tree with both messages
    const merkleHelper = new MerkleHelper()

    const { proof, root: rootBytes } = merkleHelper.createTreeAndProve(
      [messageId1, messageId2],
      [1], // Prove second message
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
    const report: of.ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message2],
      offchainTokenData: [],
      proofs: proof.hashes,
      proofFlagBits,
    }

    const result = await executeReport(report)

    // Second message should be successfully processed
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 2n,
      messageId: 2n,
      state: BigInt(of.ExecutionState.Success),
    })
  })

  it('Test commit two messages in one root and execute both messages sequentially', async () => {
    const message1 = createTestMessage(1n, 1n, receiver.address)
    const message2 = createTestMessage(2n, 2n, receiver.address)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))

    // Generate message IDs
    const messageId1 = uint8ArrayToBigInt(generateMessageId(message1, metadataHash))
    const messageId2 = uint8ArrayToBigInt(generateMessageId(message2, metadataHash))

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

      const report: of.ExecutionReport = {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        messages: [message1],
        offchainTokenData: [],
        proofs: proof.hashes,
        proofFlagBits,
      }

      const result = await executeReport(report)

      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: BigInt(of.ExecutionState.Success),
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

      const report: of.ExecutionReport = {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        messages: [message2],
        offchainTokenData: [],
        proofs: proof.hashes,
        proofFlagBits,
      }

      const result = await executeReport(report)

      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 2n,
        messageId: 2n,
        state: BigInt(of.ExecutionState.Success),
      })
    }
  })

  it('Test execute with wrong proof fails', async () => {
    const message1 = createTestMessage(1n, 1n, receiver.address)
    const message2 = createTestMessage(2n, 2n, receiver.address)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))

    // Generate message IDs
    const messageId1 = uint8ArrayToBigInt(generateMessageId(message1, metadataHash))
    const messageId2 = uint8ArrayToBigInt(generateMessageId(message2, metadataHash))

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
    const report: of.ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message1],
      offchainTokenData: [],
      proofs: proof.hashes,
      proofFlagBits,
    }

    const result = await offRamp.sendExecute(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext: { configDigest, padding: 0n, sequenceBytes: 0x02 },
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
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))

    // Generate message IDs
    const messageId1 = uint8ArrayToBigInt(generateMessageId(message1, metadataHash))
    const messageId2 = uint8ArrayToBigInt(generateMessageId(message2, metadataHash))
    const messageId3 = uint8ArrayToBigInt(generateMessageId(message3, metadataHash))

    // Create merkle tree with all three messages
    const merkleHelper = new MerkleHelper()

    const { proof, root: rootBytes } = merkleHelper.createTreeAndProve(
      [messageId1, messageId2, messageId3],
      [1], // Prove middle message
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
    const report: of.ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message2],
      offchainTokenData: [],
      proofs: proof.hashes,
      proofFlagBits,
    }

    const result = await executeReport(report)

    // Middle message should be successfully processed
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 2n,
      messageId: 2n,
      state: BigInt(of.ExecutionState.Success),
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

    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))

    // Generate message IDs for all messages
    const messageIds = messages.map((msg) =>
      uint8ArrayToBigInt(generateMessageId(msg, metadataHash)),
    )

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

      const report: of.ExecutionReport = {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        messages: [message],
        offchainTokenData: [],
        proofs: proof.hashes,
        proofFlagBits,
      }

      const result = await executeReport(report)

      // Each message should be successfully processed
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: BigInt(i + 1),
        messageId: BigInt(i + 1),
        state: BigInt(of.ExecutionState.Success),
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

    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))

    // Generate message IDs for all messages
    const messageIds = messages.map((msg) =>
      uint8ArrayToBigInt(generateMessageId(msg, metadataHash)),
    )

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

      const report: of.ExecutionReport = {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        messages: [message],
        offchainTokenData: [],
        proofs: proof.hashes,
        proofFlagBits,
      }

      const result = await executeReport(report)

      // Each message should be successfully processed
      expect(result.transactions).toHaveTransaction({
        from: router.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: BigInt(index + 1),
        messageId: BigInt(index + 1),
        state: BigInt(of.ExecutionState.Success),
      })
    }
  })

  it('cannot commit with minSeqNr smaller than current source chain config', async () => {
    await setupOCRConfig()
    await setupSourceChainConfig()

    // First commit to establish minSeqNr
    const message1 = createTestMessage(1n, 1n)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const root1Bytes = uint8ArrayToBigInt(generateMessageId(message1, metadataHash))
    const root1 = createMerkleRoot(1n, 10n, root1Bytes)

    await commitReport([root1])

    // Check that minSeqNr is now 11
    const config = await offRamp.getSourceChainConfig(CHAINSEL_EVM_TEST_90000001)
    expect(config.minSeqNr).toBe(11n)

    // Try to commit with minSeqNr smaller than current (should fail)
    const message2 = createTestMessage(5n, 5n)
    const root2Bytes = uint8ArrayToBigInt(generateMessageId(message2, metadataHash))
    const root2 = createMerkleRoot(5n, 15n, root2Bytes) // minSeqNr=5 < 11

    await commitReport(
      [root2],
      toNano('0.5'),
      0x02,
      undefined,
      false,
      of.OffRampError.InvalidInterval,
    )
  })

  it('cannot commit with minSeqNr higher than maxSeqNr', async () => {
    await setupOCRConfig()
    await setupSourceChainConfig()

    const message = createTestMessage(1n, 1n)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))

    // Create root with minSeqNr > maxSeqNr
    const root = createMerkleRoot(10n, 5n, rootBytes) // minSeqNr=10 > maxSeqNr=5

    await commitReport(
      [root],
      toNano('0.5'),
      0x01,
      undefined,
      false,
      of.OffRampError.InvalidInterval,
    )
  })

  it('test SetDynamicConfig', async () => {
    // owner can call SetDynamicConfig
    const newFeeQuoter = await generateRandomTonAddress()
    const newPermissionlessExecutionThresholdSeconds = 7200
    const result = await offRamp.sendSetDynamicConfig(deployer.getSender(), {
      value: toNano('0.1'),
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
    const result2 = await offRamp.sendSetDynamicConfig(other.getSender(), {
      value: toNano('0.1'),
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

    const result = await offRamp.sendUpdateDeployables(deployer.getSender(), {
      value: toNano('0.1'),
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

    expect(deployables.merkleRootCodeHash).toBe(uint8ArrayToBigInt(mockMerkleRootCode.hash()))

    expect(deployables.receiveExecutorCodeHash).toBe(
      uint8ArrayToBigInt(mockReceiveExecutorCode.hash()),
    )

    expect(deployables.deployerCodeHash).toBe(uint8ArrayToBigInt(deployerCode.hash()))

    // non-owner cannot update deployables
    const other = await blockchain.treasury('other')
    const result2 = await offRamp.sendUpdateDeployables(other.getSender(), {
      value: toNano('0.1'),
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
    expect(expectedSourceChainConfigs.sort()).toEqual(result.sort())
  })
  it('price updates are not sent to feequoter if they are empty', async () => {
    await setupOCRConfig()
    const priceUpdates: of.PriceUpdates = {
      tokenPriceUpdates: [],
      gasPriceUpdates: [],
    }
    const result = await commitReport([], toNano('0.5'), 0x01, priceUpdates)
    expect(result.transactions).not.toHaveTransaction({
      from: offRamp.address,
      to: feeQuoter.address,
    })

    //should send update if only one of the updates is non-empty
    const priceUpdates2: of.PriceUpdates = {
      tokenPriceUpdates: [
        {
          sourceToken: generateMockTonAddress(),
          usdPerToken: 12345678n,
        },
      ],
      gasPriceUpdates: [],
    }

    const result2 = await commitReport([], toNano('0.5'), 0x02, priceUpdates2)
    expect(result2.transactions).toHaveTransaction({
      from: offRamp.address,
      to: feeQuoter.address,
    })

    //test with other combination
    const priceUpdates3: of.PriceUpdates = {
      tokenPriceUpdates: [],
      gasPriceUpdates: [
        {
          destChainSelector: CHAINSEL_EVM_TEST_90000001,
          executionGasPrice: 1n,
          dataAvailabilityGasPrice: 1n,
        },
      ],
    }

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
      await offRamp.sendUpdateSourceChainConfigs(deployer.getSender(), {
        value: toNano('0.5'),
        configs: configsWithWrongRouter,
      })

      // Create and commit a message to a valid receiver
      const message = createTestMessage(1n, 1n, receiver.address)
      const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
      const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
      const root = createMerkleRoot(1n, 1n, rootBytes)

      await commitReport([root])

      // Try to execute - the Router_RouteMessage should bounce
      const report = createExecuteReport([message])
      const result = await executeReport(report)

      // The OffRamp should emit ExecutionStateChanged to IN_PROGRESS
      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: BigInt(of.ExecutionState.InProgress),
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
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: BigInt(of.ExecutionState.Failure),
      })
    })

    it('should handle Deployable_Initialize bounce and emit events', async () => {
      await setupOCRConfigs()

      // Try committing the same root twice. This should normally never happen because the seqNr
      // would not match, but we can intentionally build a commit report with correct seqNr
      const message1 = createTestMessage(1n, 1n, receiver.address)
      const rootBytes = uint8ArrayToBigInt(
        generateMessageId(
          message1,
          uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001)),
        ),
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
      await offRamp.sendUpdateDeployables(deployer.getSender(), {
        value: toNano('0.1'),
        receiveExecutorCode: badReceiveExecutorCode,
        merkleRootCode: merkleRootCodeRaw,
      })

      const report = createExecuteReport([message1])
      // Execute the second message
      const result = await executeReport(report)

      // Should emit IN_PROGRESS
      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: BigInt(of.ExecutionState.InProgress),
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
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: BigInt(of.ExecutionState.Failure),
      })
    })
  })

  afterAll(async () => {
    if (process.env['COVERAGE'] === 'true') {
      const testSuitePrefix = 'offramp_suite'
      await coverage.generateCoverageArtifacts(blockchain, testSuitePrefix, [
        {
          code: await offRamp.getCode(),
          name: 'offramp',
        },
        {
          code: await router.getCode(),
          name: 'router',
        },
        {
          code: await feeQuoter.getCode(),
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

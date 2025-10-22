import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { toNano, Address, Cell, Dictionary, beginCell, contractAddress, StateInit } from '@ton/core'
import { compile } from '@ton/blueprint'
import {
  Any2TVMRampMessage,
  Any2TVMMessage,
  CommitReport,
  commitReportToBuilder,
  ExecutionReport,
  MerkleRoot,
  OffRampStorage,
  RampMessageHeader,
  PriceUpdates,
  MerkleRootError,
  MERKLE_ROOT_FACILITY_ID,
  OFFRAMP_FACILITY_NAME,
  MERKLE_ROOT_FACILITY_NAME,
  OFFRAMP_FACILITY_ID,
  SourceChainConfig,
  RECEIVE_EXECUTOR_FACILITY_ID,
  RECEIVE_EXECUTOR_FACILITY_NAME,
  ReceiveExecutorError,
} from '../../wrappers/ccip/OffRamp'
import { OffRamp, OffRampError } from '../../wrappers/ccip/OffRamp'
import { FeeQuoter } from '../../wrappers/ccip/FeeQuoter'
import { assertLog, expectFailedTransaction, expectSuccessfulTransaction } from '../Logs'
import '@ton/test-utils'
import {
  bigIntToBuffer,
  bigIntToUint8Array,
  generateEd25519KeyPair,
  generateMockTonAddress,
  uint8ArrayToBigInt,
} from '../../src/utils'
import { KeyPair, sha256_sync } from '@ton/crypto'

import {
  createSignature,
  hashReport,
  OCR3_PLUGIN_TYPE_COMMIT,
  OCR3_PLUGIN_TYPE_EXECUTE,
} from '../../wrappers/libraries/ocr/MultiOCR3Base'

import * as OCR3Logs from '../../wrappers/libraries/ocr/Logs'
import * as CCIPLogs from '../../wrappers/ccip/Logs'
import { setupTestFeeQuoter } from './helpers/SetUp'

import { ReportContext, SignatureEd25519 } from '../../wrappers/libraries/ocr/MultiOCR3Base'
import { Receiver } from '../../wrappers/ccip/Receiver'
import { crc32 } from 'zlib'
import { facilityId } from '../../wrappers/utils'
import { MerkleHelper } from '../lib/merkle_proof/helpers/MerkleMultiProofHelper'

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123n
const CHAINSEL_TON = 13879075125137744094n
const EVM_SENDER_ADDRESS_TEST = 0x1a5fdbc891c5d4e6ad68064ae45d43146d4f9f3an
const EVM_ONRAMP_ADDRESS_TEST = 0x111111c891c5d4e6ad68064ae45d43146d4f9f3an
const ROUTER_ADDRESS_TEST = generateMockTonAddress()
const LEAF_DOMAIN_SEPARATOR = beginCell().storeUint(0, 256).asSlice()

// These have to match the EVM states
const EXECUTION_STATE_IN_PROGRESS = 1n
const EXECUTION_STATE_SUCCESS = 2n
const EXECUTION_STATE_FAILURE = 3n

function generateSecureRandomId(): bigint {
  return BigInt(Math.floor(Math.random() * 0x100000000)) // 2^32
}

const createSignatures = (
  signerList: KeyPair[],
  hash: Buffer<ArrayBufferLike>,
): SignatureEd25519[] => {
  return signerList.map((signer) => createSignature(signer, hash))
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

export function generateMessageId(message: Any2TVMRampMessage, metadataHash: bigint) {
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
          // .storeCoins(message.gasLimit)
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

describe('OffRamp', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let offRamp: SandboxContract<OffRamp>
  let feeQuoter: SandboxContract<FeeQuoter>
  let receiver: SandboxContract<Receiver>
  let deployerCode: Cell
  let merkleRootCodeRaw: Cell
  let receiveExecutorCodeRaw: Cell
  let transmitters: SandboxContract<TreasuryContract>[]
  let signers: KeyPair[]
  let signersPublicKeys: bigint[]

  // Constants and configuration
  const configDigest: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcden

  // Helper functions for configuration and data creation

  const createDefaultOCRConfig = (overrides = {}) => ({
    value: toNano('100'),
    configDigest,
    ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
    bigF: 1,
    isSignatureVerificationEnabled: true,
    signers: signersPublicKeys,
    transmitters: transmitters.map((t) => t.address),
    ...overrides,
  })

  const createDefaultSourceChainConfig = (overrides = {}): SourceChainConfig => ({
    router: ROUTER_ADDRESS_TEST,
    isEnabled: true,
    minSeqNr: 1n,
    isRMNVerificationDisabled: true,
    onRamp: bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST),
    ...overrides,
  })

  const createTestMessage = (
    sequenceNumber = 1n,
    messageId = 1n,
    receiverAddress = generateMockTonAddress(),
    data: Cell = Cell.EMPTY,
  ): Any2TVMRampMessage => {
    const header: RampMessageHeader = {
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
      // gasLimit: 10000000n,
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
    messages: Any2TVMRampMessage[],
    metadataHash: bigint,
  ): bigint => {
    let hashedMessages = messages.map((msg) => {
      return uint8ArrayToBigInt(generateMessageId(msg, metadataHash))
    })

    let merkleHelper: MerkleHelper = new MerkleHelper((s: Uint8Array) => {
      return new Uint8Array(sha256_sync(Buffer.from(s)))
    })

    return merkleHelper.getMerkleRoot(hashedMessages)
  }

  const setupOCRConfigs = async () => {
    await setupOCRConfig(OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
    await setupSourceChainConfig()
  }

  const setupOCRConfig = async (ocrPluginType = OCR3_PLUGIN_TYPE_COMMIT, overrides: any = {}) => {
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
    const config = createDefaultSourceChainConfig({ ...overrides })
    const result = await offRamp.sendUpdateSourceChainConfig(deployer.getSender(), {
      value: toNano('0.5'),
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      config,
    })
    expectSuccessfulTransaction(result, deployer.address, offRamp.address)

    if (isInitialSetup) {
      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.SourceChainSelectorAdded, {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      })
    }

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.SourceChainConfigUpdated, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      config: config,
    })
    return result
  }

  // Helper function to test commit report flow
  const commitReport = async (
    merkleRoots: MerkleRoot[],
    sequenceBytes = 0x01,
    priceUpdates: PriceUpdates | undefined = undefined,
  ) => {
    const report: CommitReport = { merkleRoots, priceUpdates }
    const reportContext: ReportContext = { configDigest, padding: 0n, sequenceBytes }
    const signatures = createSignatures(
      [signers[0], signers[1]],
      hashReport(commitReportToBuilder(report).endCell(), reportContext),
    )

    const result = await offRamp.sendCommit(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext,
      report,
      signatures,
    })
    expectSuccessfulTransaction(result, transmitters[0].address, offRamp.address)

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.CommitReportAccepted, {
      merkleRoot: merkleRoots[0],
      priceUpdates: priceUpdates,
    })

    return result
  }

  //TODO: When we test for token transfers this will take more parameters
  const createExecuteReport = (
    messages: Any2TVMRampMessage[],
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
    report: ExecutionReport,
    sequenceBytes = 0x02,
    expectSuccess = true,
  ) => {
    const result = await offRamp.sendExecute(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext: { configDigest, padding: 0n, sequenceBytes },
      report,
    })

    if (expectSuccess) {
      expectSuccessfulTransaction(result, transmitters[0].address, offRamp.address)
    }

    return result
  }

  const executeReportExpectingFailure = async (
    report: ExecutionReport,
    expectedErrorCode: number,
    sequenceBytes = 0x02,
  ) => {
    const result = await executeReport(report, sequenceBytes, false)
    expectFailedTransaction(result, transmitters[0].address, offRamp.address, expectedErrorCode)
    return result
  }

  const setupAndCommitMessage = async (message: Any2TVMRampMessage) => {
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupOCRConfigs()
    await commitReport([root])

    return { root, metadataHash, rootBytes }
  }

  const merkleRootAddress = (root: MerkleRoot) => {
    const data = beginCell()
      .storeAddress(offRamp.address) //owner
      .storeBuilder(getMerkleRootID(root.merkleRoot))
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
    deployer = await blockchain.treasury('deployer')
    deployerCode = await compile('Deployable')
    merkleRootCodeRaw = await compile('MerkleRoot')
    receiveExecutorCodeRaw = await compile('ReceiveExecutor')

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
      let code = await compile('OffRamp')

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

      let data: OffRampStorage = {
        id: generateSecureRandomId(),
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
        chainSelector: CHAINSEL_TON,
        permissionlessExecutionThresholdSeconds: 60,
        latestPriceSequenceNumber: 0n,
      }

      offRamp = blockchain.openContract(OffRamp.createFromConfig(data, code))

      let result = await offRamp.sendDeploy(deployer.getSender(), toNano('10000'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: offRamp.address,
        deploy: true,
        success: true,
      })
    }

    // Deploy test receiver
    {
      let code = await compile('ccip.test.receiver')
      receiver = blockchain.openContract(
        Receiver.createFromConfig({ id: 1, offramp: offRamp.address }, code),
      )
      const result = await receiver.sendDeploy(deployer.getSender(), toNano('10'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiver.address,
        deploy: true,
        success: true,
      })
    }
  }, 60_000) // setup can take a while, since we deploy contracts

  it('should deploy', async () => {
    // the check is done inside beforeEach
    // blockchain and counter are ready to use
  })

  it('should handle two OCR3 configs', async () => {
    await setupOCRConfig(OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(OCR3_PLUGIN_TYPE_EXECUTE)
  })

  it('Test commit with empty report', async () => {
    await setupOCRConfig()
    await commitReport([])
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

  it('Test commit report fails if source chain is not enabled', async () => {
    const message = createTestMessage()
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupOCRConfig()
    await setupSourceChainConfig({ isEnabled: false }) // disabled source chain

    const report: CommitReport = { merkleRoots: [root] }
    const reportContext: ReportContext = { configDigest, padding: 0n, sequenceBytes: 0x01 }
    const signatures = createSignatures(
      [signers[0], signers[1]],
      hashReport(commitReportToBuilder(report).endCell(), reportContext),
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
      OffRampError.SourceChainNotEnabled,
    )
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

    const result = await commitReport([root1, root2])

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: merkleRootAddress(root1),
      deploy: true,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: merkleRootAddress(root2),
      deploy: true,
      success: true,
    })
  })

  it('Test generateMessageId hash compatibility with Go', () => {
    // Create the exact same message as in Go test for cross-language compatibility
    const rampMessageHeader: RampMessageHeader = {
      messageId: 1n,
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      destChainSelector: CHAINSEL_TON,
      sequenceNumber: 1n,
      nonce: 0n,
    }

    const message: Any2TVMRampMessage = {
      header: rampMessageHeader,
      sender: Buffer.from(bigIntToUint8Array(EVM_SENDER_ADDRESS_TEST)),
      data: beginCell().endCell(),
      receiver: Address.parse('EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2'),
      // gasLimit: 10000000n,
      tokenAmounts: undefined,
    }

    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const messageIdHash = generateMessageId(message, metadataHash)
    const messageId = uint8ArrayToBigInt(messageIdHash)

    // Log the hash for copying to Go test
    const hashHex = messageId.toString(16).padStart(64, '0')
    console.log('Expected hash for Go test:', hashHex)

    // Basic validation that we got a valid hash
    expect(messageId).toBeGreaterThan(0n)
  })

  it('Test execute fails when root was not committed', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)

    // Setup configurations but don't commit any report
    await setupOCRConfig(OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
    await setupSourceChainConfig()

    // Try to execute without committing
    const executeReport: ExecutionReport = {
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
      from: offRamp.address,
      to: receiver.address,
    })
  })

  it('Test execute fails when different root was committed', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)
    const differentMessage = createTestMessage(2n, 2n, receiver.address)

    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const differentRootBytes = uint8ArrayToBigInt(generateMessageId(differentMessage, metadataHash))
    const differentRoot = createMerkleRoot(2n, 2n, differentRootBytes)

    // Setup configurations
    await setupOCRConfig(OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
    await setupSourceChainConfig()

    // Commit a different merkle root than what we'll try to execute
    await commitReport([differentRoot])

    // Try to execute with the original message (not the one in the committed root)
    const executeReport: ExecutionReport = {
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
      from: offRamp.address,
      to: receiver.address,
    })
  })

  it('Test execute fails when same message is sent twice', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)

    // Setup configurations
    await setupOCRConfig(OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false,
    })
    await setupSourceChainConfig()

    // Send the commit report
    await commitReport([root])

    // Create the execute report
    const executeReport: ExecutionReport = {
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
      from: offRamp.address,
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
      exitCode: MerkleRootError.AlreadyExecuted,
      success: false,
    })
  })

  it('Test execute fails with empty report', async () => {
    await setupOCRConfigs()
    const report = createExecuteReport([])
    await executeReportExpectingFailure(report, OffRampError.EmptyExecutionReport)
  })

  it('Test execute fails when message destChainSelector is wrong', async () => {
    const wrongDestMessage = createTestMessage(1n, 1n, receiver.address)
    wrongDestMessage.header.destChainSelector = 999999n

    await setupAndCommitMessage(wrongDestMessage)
    const report = createExecuteReport([wrongDestMessage])
    await executeReportExpectingFailure(report, OffRampError.InvalidMessageDestChainSelector)
  })

  it('Test execute fails when message sourceChainSelector mismatches report', async () => {
    const wrongSourceMessage = createTestMessage(1n, 1n, receiver.address)
    wrongSourceMessage.header.sourceChainSelector = 888888n

    await setupAndCommitMessage(wrongSourceMessage)
    const report = createExecuteReport([wrongSourceMessage], CHAINSEL_EVM_TEST_90000001) // Different from message
    await executeReportExpectingFailure(report, OffRampError.SourceChainSelectorMismatch)
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
    await setupSourceChainConfig({ isEnabled: false, minSeqNr: 2n }, false)

    const report = createExecuteReport([message])
    await executeReportExpectingFailure(report, OffRampError.SourceChainNotEnabled)
  })

  it('Test execute fails when source chain config does not exist', async () => {
    const unknownChainSelector = 777777n
    const message = createTestMessage(1n, 1n, receiver.address)
    message.header.sourceChainSelector = unknownChainSelector

    await setupOCRConfigs()
    const report = createExecuteReport([message], unknownChainSelector)
    await executeReportExpectingFailure(report, OffRampError.SourceChainNotEnabled)
  })

  it('Test execute succeeds with valid message and proof', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)
    await setupAndCommitMessage(message)

    const report = createExecuteReport([message])
    const result = await executeReport(report)

    // Message should be successfully processed to the receiver
    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
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
  })

  it('Test cannot call dispatch directly', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))

    const messageIdSlice = beginCell()
      .storeUint(uint8ArrayToBigInt(generateMessageId(message, metadataHash)), 256)
      .asSlice()
    const execId = messageIdSlice.loadUintBig(224)

    const result = await offRamp.sendDispatchValidated(deployer.getSender(), {
      value: toNano('0.5'),
      message: message,
      execId: execId,
    })

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: false,
      exitCode: OffRampError.MessageNotFromOwnedContract,
    })
  })

  it('Can commit with no roots and only price updates', async () => {
    await setupOCRConfig()
    const sourceToken = generateMockTonAddress()
    const priceUpdates: PriceUpdates = {
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
    const result = await commitReport([], 0x01, priceUpdates)
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
    const priceUpdates: PriceUpdates = {
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

    const result = await commitReport([root], 0x01, priceUpdates)
  })

  it('Test price update sequence number increases with OCR sequence', async () => {
    await setupOCRConfig()

    const sourceToken = generateMockTonAddress()
    const priceUpdates: PriceUpdates = {
      tokenPriceUpdates: [
        {
          sourceToken,
          usdPerToken: 100n,
        },
      ],
      gasPriceUpdates: [],
    }

    // First commit with sequence 0x01
    await commitReport([], 0x01, priceUpdates)
    let latestSeq = await offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x01n)

    // Second commit with sequence 0x05 (jump forward)
    await commitReport([], 0x05, priceUpdates)
    latestSeq = await offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x05n)

    // Third commit with higher sequence 0x10
    await commitReport([], 0x10, priceUpdates)
    latestSeq = await offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x10n)
  })

  it('Test stale price updates are rejected', async () => {
    await setupOCRConfig()

    const sourceToken = generateMockTonAddress()
    const priceUpdates: PriceUpdates = {
      tokenPriceUpdates: [
        {
          sourceToken,
          usdPerToken: 100n,
        },
      ],
      gasPriceUpdates: [],
    }

    // First commit with sequence 0x10
    await commitReport([], 0x10, priceUpdates)
    let latestSeq = await offRamp.getLatestPriceSequenceNumber()
    expect(latestSeq).toBe(0x10n)

    // Try to commit with older sequence 0x05 (should be ignored)
    await commitReport([], 0x05, priceUpdates)
    latestSeq = await offRamp.getLatestPriceSequenceNumber()
    // Sequence should remain at 0x10, stale update ignored
    expect(latestSeq).toBe(0x10n)

    // But commit with same merkle root should succeed (just price update ignored)
    const message = createTestMessage()
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)

    await setupSourceChainConfig()
    await commitReport([root], 0x08, priceUpdates) // 0x08 < 0x10, price update should be ignored
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
  })

  it('Test commit with large sequence number gap', async () => {
    await setupOCRConfig()
    await setupSourceChainConfig()

    // Commit with a large gap: minSeqNr=1, maxSeqNr=100
    const message = createTestMessage(1n, 1n)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 100n, rootBytes)

    await commitReport([root])

    // minSeqNr should jump to 101
    const config = await offRamp.getSourceChainConfig(CHAINSEL_EVM_TEST_90000001)
    expect(config.minSeqNr).toBe(101n)
  })

  it('Test receiver notifies success with non-empty data and offRamp emits ExecutionStateChanged: Success', async () => {
    const data = beginCell().storeUint(1, 1).endCell() // receiver now accepts data
    const message = createTestMessage(1n, 1n, receiver.address, data)

    await setupAndCommitMessage(message)
    const report = createExecuteReport([message])
    const result = await executeReport(report)

    // Message should be successfully processed by the receiver
    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: EXECUTION_STATE_IN_PROGRESS,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: EXECUTION_STATE_SUCCESS,
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
      from: offRamp.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: EXECUTION_STATE_IN_PROGRESS,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: EXECUTION_STATE_SUCCESS,
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
    const wrongOffRampAddress = generateMockTonAddress() // Use a different address
    const badReceiver = blockchain.openContract(
      Receiver.createFromConfig({ id: 1, offramp: wrongOffRampAddress }, code),
    )
    const result = await badReceiver.sendDeploy(deployer.getSender(), toNano('10'))

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
      from: offRamp.address,
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
        state: EXECUTION_STATE_IN_PROGRESS,
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
        state: EXECUTION_STATE_FAILURE,
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

  it('Test facilityId matches facility name', () => {
    expect(MERKLE_ROOT_FACILITY_ID).toEqual(facilityId(crc32(MERKLE_ROOT_FACILITY_NAME)))

    expect(OFFRAMP_FACILITY_ID).toEqual(facilityId(crc32(OFFRAMP_FACILITY_NAME)))

    expect(RECEIVE_EXECUTOR_FACILITY_ID).toEqual(facilityId(crc32(RECEIVE_EXECUTOR_FACILITY_NAME)))
  })

  it('Test commit two messages in one root and execute first message with proof', async () => {
    const message1 = createTestMessage(1n, 1n, receiver.address)
    const message2 = createTestMessage(2n, 2n, receiver.address)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))

    // Generate message IDs
    const messageId1 = uint8ArrayToBigInt(generateMessageId(message1, metadataHash))
    const messageId2 = uint8ArrayToBigInt(generateMessageId(message2, metadataHash))

    // Create merkle tree with both messages
    const merkleHelper = new MerkleHelper((s: Uint8Array) => {
      return new Uint8Array(sha256_sync(Buffer.from(s)))
    })

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
    const report: ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message1],
      offchainTokenData: [],
      proofs: proof.hashes,
      proofFlagBits,
    }

    const result = await executeReport(report)

    // First message should be successfully processed
    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 1n,
      messageId: 1n,
      state: EXECUTION_STATE_SUCCESS,
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
    const merkleHelper = new MerkleHelper((s: Uint8Array) => {
      return new Uint8Array(sha256_sync(Buffer.from(s)))
    })

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
    const report: ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message2],
      offchainTokenData: [],
      proofs: proof.hashes,
      proofFlagBits,
    }

    const result = await executeReport(report)

    // Second message should be successfully processed
    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 2n,
      messageId: 2n,
      state: EXECUTION_STATE_SUCCESS,
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
    const merkleHelper = new MerkleHelper((s: Uint8Array) => {
      return new Uint8Array(sha256_sync(Buffer.from(s)))
    })

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

      const report: ExecutionReport = {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        messages: [message1],
        offchainTokenData: [],
        proofs: proof.hashes,
        proofFlagBits,
      }

      const result = await executeReport(report)

      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 1n,
        messageId: 1n,
        state: EXECUTION_STATE_SUCCESS,
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

      const report: ExecutionReport = {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        messages: [message2],
        offchainTokenData: [],
        proofs: proof.hashes,
        proofFlagBits,
      }

      const result = await executeReport(report)

      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: 2n,
        messageId: 2n,
        state: EXECUTION_STATE_SUCCESS,
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
    const merkleHelper = new MerkleHelper((s: Uint8Array) => {
      return new Uint8Array(sha256_sync(Buffer.from(s)))
    })

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
    const report: ExecutionReport = {
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
      from: offRamp.address,
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
    const merkleHelper = new MerkleHelper((s: Uint8Array) => {
      return new Uint8Array(sha256_sync(Buffer.from(s)))
    })

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
    const report: ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message2],
      offchainTokenData: [],
      proofs: proof.hashes,
      proofFlagBits,
    }

    const result = await executeReport(report)

    // Middle message should be successfully processed
    expect(result.transactions).toHaveTransaction({
      from: offRamp.address,
      to: receiver.address,
      success: true,
    })

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      sequenceNumber: 2n,
      messageId: 2n,
      state: EXECUTION_STATE_SUCCESS,
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
    const merkleHelper = new MerkleHelper((s: Uint8Array) => {
      return new Uint8Array(sha256_sync(Buffer.from(s)))
    })

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

      const report: ExecutionReport = {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        messages: [message],
        offchainTokenData: [],
        proofs: proof.hashes,
        proofFlagBits,
      }

      const result = await executeReport(report)

      // Each message should be successfully processed
      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: BigInt(i + 1),
        messageId: BigInt(i + 1),
        state: EXECUTION_STATE_SUCCESS,
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
    const merkleHelper = new MerkleHelper((s: Uint8Array) => {
      return new Uint8Array(sha256_sync(Buffer.from(s)))
    })

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

      const report: ExecutionReport = {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        messages: [message],
        offchainTokenData: [],
        proofs: proof.hashes,
        proofFlagBits,
      }

      const result = await executeReport(report)

      // Each message should be successfully processed
      expect(result.transactions).toHaveTransaction({
        from: offRamp.address,
        to: receiver.address,
        success: true,
      })

      assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.ExecutionStateChanged, {
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        sequenceNumber: BigInt(index + 1),
        messageId: BigInt(index + 1),
        state: EXECUTION_STATE_SUCCESS,
      })
    }
  })
})

import { Blockchain, BlockchainTransaction, SandboxContract, TreasuryContract } from '@ton/sandbox'
import {
  toNano,
  Address,
  Cell,
  Dictionary,
  Message,
  beginCell,
  contractAddress,
  StateInit,
} from '@ton/core'
import { compile, sleep } from '@ton/blueprint'
import {
  Any2TVMRampMessage,
  CommitReport,
  commitReportToBuilder,
  ExecutionReport,
  MerkleRoot,
  OffRampStorage,
  PriceUpdates,
  RampMessageHeader,
  SourceChainConfig,
} from '../../wrappers/ccip/OffRamp'
import { OffRamp } from '../../wrappers/ccip/OffRamp'
import {
  createTimestampedPriceValue,
  FeeQuoter,
  FeeQuoterStorage,
  TimestampedPrice,
} from '../../wrappers/ccip/FeeQuoter'
import { assertLog, expectFailedTransaction, expectSuccessfulTransaction } from '../Logs'
import '@ton/test-utils'
import { bigIntToBuffer, uint8ArrayToBigInt } from '../../src/utils'
import { KeyPair, sha256_sync } from '@ton/crypto'

import {
  expectEqualsConfig,
  generateEd25519KeyPair,
  generateMockTonAddress,
  generateRandomAddresses,
  generateRandomMockAddresses,
} from '../libraries/ocr/Helpers'
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
import { ExampleReceiver } from '../../wrappers/ccip/Receiver'
import { findTransactionRequired } from '@ton/test-utils'

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123n
const CHAINSEL_TON = 13879075125137744094n
const EVM_SENDER_ADDRESS_TEST = 0x1a5fdbc891c5d4e6ad68064ae45d43146d4f9f3an
const EVM_ONRAMP_ADDRESS_TEST = 0x111111c891c5d4e6ad68064ae45d43146d4f9f3an
const ROUTER_ADDRESS_TEST = generateMockTonAddress()
const LEAF_DOMAIN_SEPARATOR = beginCell().storeUint(0, 256).asSlice()
const ERROR_SOURCE_CHAIN_NOT_ENABLED = 266

function generateSecureRandomString(length: number): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => ('0' + (byte % 36).toString(36)).slice(-1)).join('')
}

const createSignatures = (
  signerList: KeyPair[],
  hash: Buffer<ArrayBufferLike>,
): SignatureEd25519[] => {
  return signerList.map((signer) => createSignature(signer, hash))
}

const getMerkleRootID = (root: bigint) => {
  return beginCell().storeUint(1, 16).storeUint(root, 256)
}

const getMetadataHash = (sourceChainSelector: bigint) => {
    const hash = beginCell()
    .storeUint(uint8ArrayToBigInt(sha256_sync('Any2TVMMessageHashV1')), 256)
    .storeUint(sourceChainSelector, 64)
    .storeUint(CHAINSEL_TON, 64)
    .storeRef(beginCell()
      .storeUint(bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST).byteLength, 8)
      .storeBuffer(
        bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST),
        bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST).byteLength
      )
      .endCell()
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
          //.storeCoins(message.gasLimit)
          .storeUint(message.header.nonce, 64)
          .endCell()
      )
      //message sender
      .storeRef(
        beginCell()
        .storeUint(message.sender.byteLength, 8)
        .storeBuffer(message.sender, message.sender.byteLength)
        .endCell()
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
  let receiver: SandboxContract<ExampleReceiver>
  let deployerCode: Cell
  let merkleRootCodeRaw: Cell
  let transmitters: SandboxContract<TreasuryContract>[]
  let signers: KeyPair[]
  let signersPublicKeys: bigint[]

  // Constants and configuration
  const configDigest: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcden

  // Helper functions for configuration
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

  const createDefaultSourceChainConfig = (overrides = {}) => ({
    router: ROUTER_ADDRESS_TEST,
    isEnabled: true,
    minSeqNr: 1n,
    isRMNVerificationDisabled: false,
    onRamp: bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST),
    ...overrides,
  })

  // Helper functions for test data creation
  const createTestMessage = (sequenceNumber = 1n, messageId = 1n, receiverAddress = generateMockTonAddress()) => {
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
      data: beginCell().endCell(),
      receiver: receiverAddress,
    }
  }

  const createMerkleRoot = (minSeqNr: bigint, maxSeqNr: bigint, merkleRootBytes: bigint) => ({
    sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
    onRampAddress: bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST),
    minSeqNr,
    maxSeqNr,
    merkleRoot: merkleRootBytes,
  })

  // Helper functions for setup operations
  const setupOCRConfig = async (ocrPluginType = OCR3_PLUGIN_TYPE_COMMIT, overrides: any = {}) => {
    const result = await offRamp.sendSetOCR3Config(
      deployer.getSender(),
      createDefaultOCRConfig({ ocrPluginType, ...overrides })
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

  const setupSourceChainConfig = async (isEnabled = true, overrides = {}) => {
    const config = createDefaultSourceChainConfig({ isEnabled, ...overrides })
    const result = await offRamp.sendUpdateSourceChainConfig(deployer.getSender(), {
      value: toNano('0.5'),
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      config,
    })
    expectSuccessfulTransaction(result, deployer.address, offRamp.address)
    return result
  }

  const commitReport = async (merkleRoots: MerkleRoot[], sequenceBytes = 0x01) => {
    const report: CommitReport = { merkleRoots }
    const reportContext: ReportContext = { configDigest, padding: 0n, sequenceBytes }
    const signatures = createSignatures(
      [signers[0], signers[1]],
      hashReport(commitReportToBuilder(report).endCell(), reportContext)
    )

    const result = await offRamp.sendCommit(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext,
      report,
      signatures,
    })
    expectSuccessfulTransaction(result, transmitters[0].address, offRamp.address)

    assertLog(result.transactions, offRamp.address, CCIPLogs.LogTypes.CCIPCommitReportAccepted, {
      priceUpdates: undefined,
      merkleRoots,
    })

    return result
  }

  const merkleRootAddress = (root: MerkleRoot) => {
    const data = beginCell()
      .storeAddress(offRamp.address) //owner
      .storeUint(1, 16) //id
      .storeUint(root.merkleRoot, 256)
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
    const libs = beginCell().storeDictDirect(_libs).endCell()
    blockchain.libs = libs

    // setup fee quoter
    feeQuoter = await setupTestFeeQuoter(deployer, blockchain)

    // Deploy test receiver
    {
      let code = await compile('Receiver')
      receiver = blockchain.openContract(ExampleReceiver.create(code))
      const result = await receiver.sendDeploy(deployer.getSender(), toNano("10"))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiver.address,
        deploy: true,
        success: true
      })
    }

  })

  beforeEach(async () => {
    // Using a different deployer changes the value of owner
    // and gets us a contract with a different address every time
    const generateRandomDeployer = () => {
      const name = `deployer-${generateSecureRandomString(8)}`
      return blockchain.treasury(name)
    }

    deployer = await generateRandomDeployer()
    // setup offramp
    {
      let code = await compile('OffRamp')

      // Use a library reference
      let libPrep = beginCell().storeUint(2, 8).storeBuffer(merkleRootCodeRaw.hash()).endCell()
      let merkleRootCode = new Cell({ exotic: true, bits: libPrep.bits, refs: libPrep.refs })

      let data: OffRampStorage = {
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        deployerCode: deployerCode,
        merkleRootCode: merkleRootCode,
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
      //to: merkleRootAddress(root), TODO: calculate merkleRoot address correctly this is not working
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
    await setupSourceChainConfig(false) // disabled source chain

    const report: CommitReport = { merkleRoots: [root] }
    const reportContext: ReportContext = { configDigest, padding: 0n, sequenceBytes: 0x01 }
    const signatures = createSignatures(
      [signers[0], signers[1]],
      hashReport(commitReportToBuilder(report).endCell(), reportContext)
    )

    const result = await offRamp.sendCommit(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext,
      report,
      signatures,
    })
    
    expectFailedTransaction(result, transmitters[0].address, offRamp.address, ERROR_SOURCE_CHAIN_NOT_ENABLED)
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
      //to: merkleRootAddress(root), TODO: calculate merkleRoot address correctly this is not working
      deploy: true,
      success: true,
    })
  })

  it('Test execute flow', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root = createMerkleRoot(1n, 1n, rootBytes)

    // Setup configurations
    await setupOCRConfig(OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false
    })
    await setupSourceChainConfig()

    // Send the commit report
    const commitResult = await commitReport([root])

    expect(commitResult.transactions).toHaveTransaction({
      from: offRamp.address,
      //to: merkleRootAddress(root), TODO: calculate merkleRoot address correctly this is not working
      deploy: true,
      success: true,
    })

    /*
    const deployTx = findTransactionRequired(commitResult.transactions, {
      from: offRamp.address,
      deploy: true,
      success: true
    })

    const merkleRootAddress = deployTx.inMessage!.info.dest
    const state = (await blockchain.getContract(merkleRootAddress as Address)).accountState;
    if (state?.type === 'active') {
            console.log('code', state.state.code!.hash());
            console.log('data', state.state.data);
    }
    */

    // Send the execute report
    const executeReport: ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message],
      offchainTokenData: [],
      proofs: [],
      proofFlagBits: 0n
    }

    const executeResult = await offRamp.sendExecute(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext: { configDigest, padding: 0n, sequenceBytes: 0x02 },
      report: executeReport,
    })

    expect(executeResult.transactions).toHaveTransaction({
      from: offRamp.address,
      to: receiver.address,
      success: true,
    })
  })

  it('Test execute fails when root was not committed', async () => {
    const message = createTestMessage(1n, 1n, receiver.address)

    // Setup configurations but don't commit any report
    await setupOCRConfig(OCR3_PLUGIN_TYPE_COMMIT)
    await setupOCRConfig(OCR3_PLUGIN_TYPE_EXECUTE, {
      signers: [],
      isSignatureVerificationEnabled: false
    })
    await setupSourceChainConfig()

    // Try to execute without committing
    const executeReport: ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      messages: [message],
      offchainTokenData: [],
      proofs: [],
      proofFlagBits: 0n
    }

    const executeResult = await offRamp.sendExecute(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext: { configDigest, padding: 0n, sequenceBytes: 0x02 },
      report: executeReport,
    })

    // For now, let's check what actually happens in the execution
    // We expect the execution might succeed but the message processing should fail
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
      isSignatureVerificationEnabled: false
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
      proofFlagBits: 0n
    }

    const executeResult = await offRamp.sendExecute(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext: { configDigest, padding: 0n, sequenceBytes: 0x02 },
      report: executeReport,
    })

    // The execute call itself might succeed, but message processing should fail
    expect(executeResult.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: offRamp.address,
      success: true, // The execute call itself succeeds
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
})

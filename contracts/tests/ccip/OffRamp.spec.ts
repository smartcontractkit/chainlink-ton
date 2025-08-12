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
import { compile } from '@ton/blueprint'
import {
  Any2TVMRampMessage,
  CommitReport,
  commitReportToBuilder,
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
import { KeyPair, sha256_sync } from '@ton/crypto'
import '@ton/test-utils'
import { bigIntToUint8Array, uint8ArrayToBigInt, ZERO_ADDRESS } from '../../utils'
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

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123n
const CHAINSEL_TON = 13879075125137744094n
const EVM_SENDER_ADDRESS_TEST = 0x1a5fdbc891c5d4e6ad68064ae45d43146d4f9f3an
const EVM_ONRAMP_ADDRESS_TEST = 0x111111c891c5d4e6ad68064ae45d43146d4f9f3an
const EVM_ROUTER_ADDRESS_TEST = 0x0bf3de8c5d3e8a2b34d2beeb17abfcebaf363a59n
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
  return beginCell()
    .storeUint(uint8ArrayToBigInt(sha256_sync('Any2TVMMessageHashV1')), 256)
    .storeUint(sourceChainSelector, 64)
    .storeUint(CHAINSEL_TON, 64)
    .storeSlice(beginCell().storeUint(EVM_SENDER_ADDRESS_TEST, 160).asSlice())
    .endCell()
    .hash()
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
          .endCell(),
      )
      //message
      .storeUint(message.sender.byteLength, 8)
      .storeBuffer(message.sender, message.sender.byteLength)
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
  let deployerCode: Cell
  let merkleRootCodeRaw: Cell
  let transmitters: SandboxContract<TreasuryContract>[]
  let signers: KeyPair[]
  let signersPublicKeys: bigint[]

  // Helper functions
  const configDigest: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcden

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
    console.log(deployerCode)
    console.log(data)
    console.log(init)

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
        merkleRootCode,
        feeQuoter: feeQuoter.address,
        chainSelector: CHAINSEL_TON,
        permissionlessExecutionThresholdSeconds: 60,
        latestPriceSequenceNumber: 0n,
      }

      offRamp = blockchain.openContract(OffRamp.createFromConfig(data, code))

      let result = await offRamp.sendDeploy(deployer.getSender(), toNano('1'))
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
    const resultSetCommit = await offRamp.sendSetOCR3Config(
      deployer.getSender(),
      createDefaultOCRConfig(),
    )
    expect(resultSetCommit.transactions).toHaveTransaction({
      from: deployer.address,
      to: offRamp.address,
      success: true,
    })

    assertLog(resultSetCommit.transactions, offRamp.address, OCR3Logs.LogTypes.OCR3BaseConfigSet, {
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      configDigest,
      signers: signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
      bigF: 1,
    })

    const resultSetExecute = await offRamp.sendSetOCR3Config(
      deployer.getSender(),
      createDefaultOCRConfig({ ocrPluginType: OCR3_PLUGIN_TYPE_EXECUTE }),
    )
    expectSuccessfulTransaction(resultSetExecute, deployer.address, offRamp.address)
    assertLog(resultSetExecute.transactions, offRamp.address, OCR3Logs.LogTypes.OCR3BaseConfigSet, {
      ocrPluginType: OCR3_PLUGIN_TYPE_EXECUTE,
      configDigest,
      signers: signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
      bigF: 1,
    })
  })

  it('Test commit with empty report', async () => {
    const resultSetConfig = await offRamp.sendSetOCR3Config(
      deployer.getSender(),
      createDefaultOCRConfig(),
    )
    expectSuccessfulTransaction(resultSetConfig, deployer.address, offRamp.address)

    let reportContext: ReportContext = { configDigest, padding: 0n, sequenceBytes: 0x01 }
    let report: CommitReport
    report = {
      merkleRoots: [],
    }

    const signatures = createSignatures(
      [signers[0], signers[1]],
      hashReport(commitReportToBuilder(report).endCell(), reportContext),
    )

    const resultCommit = await offRamp.sendCommit(transmitters[0].getSender(), {
      value: toNano('10'),
      reportContext: reportContext,
      report: report,
      signatures: signatures,
    })
    expectSuccessfulTransaction(resultCommit, transmitters[0].address, offRamp.address)

    assertLog(
      resultCommit.transactions,
      offRamp.address,
      CCIPLogs.LogTypes.CCIPCommitReportAccepted,
      {
        priceUpdates: undefined,
        merkleRoots: [],
      },
    )
  })

  it('Test commit with one merkle root for one empty message', async () => {
    const rampMessageHeader: RampMessageHeader = {
      messageId: 1n,
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      destChainSelector: CHAINSEL_TON,
      sequenceNumber: 1n,
      nonce: 1n,
    }

    const message: Any2TVMRampMessage = {
      header: rampMessageHeader,
      sender: Buffer.from(bigIntToUint8Array(EVM_SENDER_ADDRESS_TEST)),
      data: beginCell().endCell(),
      receiver: generateMockTonAddress(),
    }

    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))

    const root: MerkleRoot = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      onRampAddress: Buffer.from(bigIntToUint8Array(EVM_ONRAMP_ADDRESS_TEST)),
      minSeqNr: 1n,
      maxSeqNr: 1n,
      merkleRoot: rootBytes,
    }

    const report: CommitReport = {
      merkleRoots: [root],
    }
    const reportContext: ReportContext = { configDigest, padding: 0n, sequenceBytes: 0x01 }

    const signatures = createSignatures(
      [signers[0], signers[1]],
      hashReport(commitReportToBuilder(report).endCell(), reportContext),
    )

    const resultSetCommit = await offRamp.sendSetOCR3Config(
      deployer.getSender(),
      createDefaultOCRConfig(),
    )
    expectSuccessfulTransaction(resultSetCommit, deployer.address, offRamp.address)

    assertLog(resultSetCommit.transactions, offRamp.address, OCR3Logs.LogTypes.OCR3BaseConfigSet, {
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      configDigest,
      signers: signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
      bigF: 1,
    })
    const sourceChainConfig: SourceChainConfig = {
      router: Buffer.from(bigIntToUint8Array(EVM_ROUTER_ADDRESS_TEST)),
      isEnabled: true,
      minSeqNr: 1n,
      isRMNVerificationDisabled: false,
      onRamp: Buffer.from(bigIntToUint8Array(EVM_ONRAMP_ADDRESS_TEST)),
    }

    const resultUpdateSourceChainConfig = await offRamp.sendUpdateSourceChainConfig(
      deployer.getSender(),
      {
        value: toNano('0.5'),
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        config: sourceChainConfig,
      },
    )

    expectSuccessfulTransaction(resultUpdateSourceChainConfig, deployer.address, offRamp.address)

    const resultCommitReport = await offRamp.sendCommit(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext: reportContext,
      report: report,
      signatures: signatures,
    })
    expectSuccessfulTransaction(resultCommitReport, transmitters[0].address, offRamp.address)

    assertLog(
      resultCommitReport.transactions,
      offRamp.address,
      CCIPLogs.LogTypes.CCIPCommitReportAccepted,
      {
        priceUpdates: undefined,
        merkleRoots: [root],
      },
    )

    expect(resultCommitReport.transactions).toHaveTransaction({
      from: offRamp.address,
      //to: merkleRootAddress(root), TODO: calculate merkleRoot address correctly this is not working
      deploy: true,
      success: true,
    })
  })

  it('Test commit report fails if source chain is not enabled', async () => {
    const rampMessageHeader: RampMessageHeader = {
      messageId: 1n,
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      destChainSelector: CHAINSEL_TON,
      sequenceNumber: 1n,
      nonce: 1n,
    }
    const message: Any2TVMRampMessage = {
      header: rampMessageHeader,
      sender: Buffer.from(bigIntToUint8Array(EVM_SENDER_ADDRESS_TEST)),
      data: beginCell().endCell(),
      receiver: generateMockTonAddress(),
    }
    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST_90000001))
    const rootBytes = uint8ArrayToBigInt(generateMessageId(message, metadataHash))
    const root: MerkleRoot = {
      sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
      onRampAddress: Buffer.from(bigIntToUint8Array(EVM_ONRAMP_ADDRESS_TEST)),
      minSeqNr: 1n,
      maxSeqNr: 1n,
      merkleRoot: rootBytes,
    }
    const report: CommitReport = {
      merkleRoots: [root],
    }
    const reportContext: ReportContext = { configDigest, padding: 0n, sequenceBytes: 0x01 }
    const signatures = createSignatures(
      [signers[0], signers[1]],
      hashReport(commitReportToBuilder(report).endCell(), reportContext),
    )
    const resultSetCommit = await offRamp.sendSetOCR3Config(
      deployer.getSender(),
      createDefaultOCRConfig(),
    )
    expectSuccessfulTransaction(resultSetCommit, deployer.address, offRamp.address)
    assertLog(resultSetCommit.transactions, offRamp.address, OCR3Logs.LogTypes.OCR3BaseConfigSet, {
      ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
      configDigest,
      signers: signersPublicKeys,
      transmitters: transmitters.map((t) => t.address),
      bigF: 1,
    })
    // Update source chain config to be disabled
    const sourceChainConfigDisabled: SourceChainConfig = {
      router: Buffer.from(bigIntToUint8Array(EVM_ROUTER_ADDRESS_TEST)),
      isEnabled: false,
      minSeqNr: 1n,
      isRMNVerificationDisabled: false,
      onRamp: Buffer.from(bigIntToUint8Array(EVM_ONRAMP_ADDRESS_TEST)),
    }
    const resultUpdateSourceChainConfig = await offRamp.sendUpdateSourceChainConfig(
      deployer.getSender(),
      {
        value: toNano('0.5'),
        sourceChainSelector: CHAINSEL_EVM_TEST_90000001,
        config: sourceChainConfigDisabled,
      },
    )
    expectSuccessfulTransaction(resultUpdateSourceChainConfig, deployer.address, offRamp.address)
    const resultCommitReport = await offRamp.sendCommit(transmitters[0].getSender(), {
      value: toNano('0.5'),
      reportContext: reportContext,
      report: report,
      signatures: signatures,
    })
    expectFailedTransaction(
      resultCommitReport,
      transmitters[0].address,
      offRamp.address,
      ERROR_SOURCE_CHAIN_NOT_ENABLED,
    )
  })
})

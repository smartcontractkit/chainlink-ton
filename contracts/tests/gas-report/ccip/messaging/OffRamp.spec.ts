import {
  Blockchain,
  SandboxContract,
  TreasuryContract,
  printTransactionFees,
  createMetricStore,
  makeSnapshotMetric,
  ContractDatabase,
  resetMetricStore,
} from '@ton/sandbox'
import { toNano, Cell, Dictionary, Address, beginCell } from '@ton/core'
import * as rt from '../../../../wrappers/ccip/Router'
import * as or from '../../../../wrappers/ccip/OnRamp'
import { FeeQuoter } from '../../../../wrappers/ccip/FeeQuoter'
import {
  Any2TVMRampMessage,
  builder,
  CommitReport,
  ExecutionReport,
  MerkleRoot,
  OffRampStorage,
  FACILITY_ID,
  OffRamp,
} from '../../../../wrappers/ccip/OffRamp'
import '@ton/test-utils'
import {
  ZERO_ADDRESS,
  generateMockTonAddress,
  bigIntToBuffer,
  uint8ArrayToBigInt,
  generateEd25519KeyPair,
} from '../../../../src/utils'
import { setupTestFeeQuoter } from '../../../ccip/helpers/SetUp'
import { Receiver, ReceiverBehavior } from '../../../../wrappers/ccip/Receiver'
import {
  hashReport,
  OCR3_PLUGIN_TYPE_COMMIT,
  OCR3_PLUGIN_TYPE_EXECUTE,
  ReportContext,
} from '../../../../wrappers/libraries/ocr/MultiOCR3Base'
import { KeyPair, sha256_sync } from '@ton/crypto'
import {
  CHAINSEL_TON,
  CHAINSEL_EVM_TEST,
  EVM_SENDER_ADDRESS_TEST,
  EVM_ONRAMP_ADDRESS_TEST,
  CHAIN_FAMILY_SELECTOR_EVM,
} from '../../constants'
import { createMaxPayload, createExtraArgs, MESSAGE_COUNT_IN_COMMIT } from './config'
import { MerkleHelper } from '../../../lib/merkle_proof/helpers/MerkleMultiProofHelper'
import { getMetadataHash, generateMessageId, createSignatures } from './helpers'
import { analyzeSnapshot, printFlowAnalysis } from '../../utils'
import * as path from 'path'
import * as fs from 'fs'
import { opMapFunc } from './opMapFunc'
import { ContractClient as DeployableContract } from '../../../../wrappers/libraries/Deployable'
import * as mr from '../../../../wrappers/ccip/MerkleRoot'
import { ContractClient as CCIPSendExecutorContract } from '../../../../wrappers/ccip/CCIPSendExecutor'

const ROUTER_ADDRESS_TEST = generateMockTonAddress()

// Override console to remove Jest's "console.log" prefixes
const jestConsole = console

// Load contract database for metric analysis
const contractDatabasePath = path.join(__dirname, '../../../../contract.abi.json')
const contractDatabaseData = JSON.parse(fs.readFileSync(contractDatabasePath, 'utf8'))
const contractDatabase = ContractDatabase.from(contractDatabaseData)

// Initialize metric store
const store = createMetricStore()

describe('CCIP OffRamp Gas Estimation', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let sender: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let feeQuoter: SandboxContract<FeeQuoter>
  let onRamp: SandboxContract<or.OnRamp>
  let offRamp: SandboxContract<OffRamp>
  let receiver: SandboxContract<Receiver>
  let deployerCode: Cell
  let merkleRootCodeRaw: Cell
  let transmitters: SandboxContract<TreasuryContract>[]
  let signers: KeyPair[]
  let signersPublicKeys: bigint[]

  const configDigest: bigint = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcden

  beforeEach(() => {
    global.console = require('console')
  })
  afterEach(() => {
    global.console = jestConsole
  })

  beforeAll(async () => {
    // Use default config (mainnet) to avoid rate limiting
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    sender = await blockchain.treasury('sender')

    // Setup transmitters and signers for OCR
    transmitters = [
      await blockchain.treasury('transmitter1'),
      await blockchain.treasury('transmitter2'),
      await blockchain.treasury('transmitter3'),
      await blockchain.treasury('transmitter4'),
    ]

    signers = await Promise.all([
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
    ])

    signersPublicKeys = signers.map((s) => uint8ArrayToBigInt(s.publicKey))

    // Compile contracts
    deployerCode = await DeployableContract.code()
    merkleRootCodeRaw = await mr.MerkleRoot.code()

    // Setup blockchain libs for MerkleRoot
    const _libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
    _libs.set(BigInt(`0x${merkleRootCodeRaw.hash().toString('hex')}`), merkleRootCodeRaw)
    const libs = beginCell().storeDictDirect(_libs).endCell()
    blockchain.libs = libs

    // Deploy Router
    {
      let routerCode = await rt.Router.code()
      let data: rt.Storage = {
        id: 0n,
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        wrappedNative: ZERO_ADDRESS,
        onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
        offRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
      }
      router = blockchain.openContract(rt.Router.createFromConfig(data, routerCode))
      const result = await router.sendInternal(deployer.getSender(), toNano('1'), Cell.EMPTY)
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: router.address,
        deploy: true,
        success: true,
      })
    }

    // Deploy FeeQuoter
    feeQuoter = await setupTestFeeQuoter(deployer, blockchain)

    // Deploy OnRamp
    {
      let code = await or.OnRamp.code()
      let data: or.OnRampStorage = {
        id: 0n,
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        chainSelector: CHAINSEL_TON,
        config: {
          feeQuoter: feeQuoter.address,
          feeAggregator: deployer.address,
          allowlistAdmin: deployer.address,
          reserve: toNano('1'),
        },
        destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
        executor: {
          currentID: 0n,
          executorCode: await CCIPSendExecutorContract.code(),
          deployableCode: await DeployableContract.code(),
        },
      }
      onRamp = blockchain.openContract(or.OnRamp.createFromConfig(data, code))
      const result = await onRamp.sendDeploy(deployer.getSender(), toNano('1'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: onRamp.address,
        deploy: true,
        success: true,
      })

      // Add onRamp to router
      const addResult = await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
        value: toNano('1'),
        data: {
          queryID: BigInt(0),
          onRamps: {
            destChainSelectors: [CHAINSEL_EVM_TEST],
            onRamp: onRamp.address,
          },
        },
      })
      expect(addResult.transactions).toHaveTransaction({
        to: router.address,
        success: true,
      })

      // Add destChainConfig to OnRamp
      const configResult = await onRamp.sendUpdateDestChainConfigs(deployer.getSender(), {
        value: toNano('1'),
        destChainConfigs: [
          {
            destChainSelector: CHAINSEL_EVM_TEST,
            router: router.address,
            allowlistEnabled: false,
          },
        ],
      })
      expect(configResult.transactions).toHaveTransaction({
        to: onRamp.address,
        success: true,
      })
    }

    // Deploy OffRamp
    {
      let code = await OffRamp.code()

      // Use a library reference for merkleRootCode
      let libPrep = beginCell().storeUint(2, 8).storeBuffer(merkleRootCodeRaw.hash()).endCell()
      let merkleRootCode = new Cell({ exotic: true, bits: libPrep.bits, refs: libPrep.refs })

      let data: OffRampStorage = {
        id: BigInt(FACILITY_ID),
        ownable: {
          owner: deployer.address,
          pendingOwner: null,
        },
        router: router.address,
        deployables: {
          deployerCode: beginCell().endCell(),
          merkleRootCode: beginCell().endCell(),
          receiveExecutorCode: beginCell().endCell(),
        },
        feeQuoter: feeQuoter.address,
        chainSelector: CHAINSEL_TON,
        permissionlessExecutionThresholdSeconds: 60,
        latestPriceSequenceNumber: 0n,
      }
      offRamp = blockchain.openContract(OffRamp.createFromConfig(data, code))
      const result = await offRamp.sendDeploy(deployer.getSender(), toNano('10000'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: offRamp.address,
        deploy: true,
        success: true,
      })

      // Setup OCR configs
      const commitConfigResult = await offRamp.sendSetOCR3Config(deployer.getSender(), {
        value: toNano('100'),
        configDigest,
        ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
        bigF: 1,
        isSignatureVerificationEnabled: true,
        signers: signersPublicKeys,
        transmitters: transmitters.map((t) => t.address),
      })
      expect(commitConfigResult.transactions).toHaveTransaction({
        to: offRamp.address,
        success: true,
      })

      const executeConfigResult = await offRamp.sendSetOCR3Config(deployer.getSender(), {
        value: toNano('100'),
        configDigest,
        ocrPluginType: OCR3_PLUGIN_TYPE_EXECUTE,
        bigF: 1,
        isSignatureVerificationEnabled: false,
        signers: [],
        transmitters: transmitters.map((t) => t.address),
      })
      expect(executeConfigResult.transactions).toHaveTransaction({
        to: offRamp.address,
        success: true,
      })

      // Setup source chain config
      const sourceChainConfigResult = await offRamp.sendUpdateSourceChainConfigs(
        deployer.getSender(),
        {
          value: toNano('0.5'),
          configs: [
            {
              sourceChainSelector: CHAINSEL_EVM_TEST,
              config: {
                router: ROUTER_ADDRESS_TEST,
                isEnabled: true,
                minSeqNr: 1n,
                isRMNVerificationDisabled: false,
                onRamp: bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST),
              },
            },
          ],
        },
      )
      expect(sourceChainConfigResult.transactions).toHaveTransaction({
        to: offRamp.address,
        success: true,
      })
    }

    // Deploy ExampleReceiver
    {
      const receiverCode = await Receiver.code()
      receiver = blockchain.openContract(
        Receiver.createFromConfig(
          {
            id: 0n,
            ownable: { owner: deployer.address, pendingOwner: null },
            authorizedCaller: router.address,
            behavior: ReceiverBehavior.Accept,
          },
          receiverCode,
        ),
      )
      const result = await receiver.sendDeploy(deployer.getSender(), toNano('1'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: receiver.address,
        deploy: true,
        success: true,
      })
    }
  })

  it('should measure commit and execute flow (1 merkle root)', async () => {
    const maxPayload = createMaxPayload()

    // Step 1: Create test message
    const testMessage: Any2TVMRampMessage = {
      header: {
        messageId: 1n,
        sourceChainSelector: CHAINSEL_EVM_TEST,
        destChainSelector: CHAINSEL_TON,
        sequenceNumber: 1n,
        nonce: 0n,
      },
      gasLimit: 500000n,
      sender: bigIntToBuffer(EVM_SENDER_ADDRESS_TEST),
      data: maxPayload,
      receiver: receiver.address,
    }

    const metadataHash = uint8ArrayToBigInt(getMetadataHash(CHAINSEL_EVM_TEST))
    const messageIdBytes = generateMessageId(testMessage, metadataHash)
    const rootBytes = uint8ArrayToBigInt(messageIdBytes)

    // Step 2: Create merkle roots
    const merkleRoots: MerkleRoot[] = []
    merkleRoots.push({
      sourceChainSelector: CHAINSEL_EVM_TEST,
      onRampAddress: bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST),
      minSeqNr: 1n,
      maxSeqNr: 10n,
      merkleRoot: rootBytes + 0n,
    })

    const commitReport: CommitReport = {
      merkleRoots,
      priceUpdates: undefined,
    }

    const reportContext: ReportContext = {
      configDigest,
      padding: 0n,
      sequenceBytes: 0x01,
    }

    const signatures = createSignatures(
      [signers[0], signers[1]],
      hashReport(builder.data.commitReport.encode(commitReport).endCell(), reportContext),
    )

    // Step 3: Commit phase
    resetMetricStore()

    const commitResult = await offRamp.sendCommit(transmitters[0].getSender(), {
      value: toNano('0.2'), // Increased for larger batches
      reportContext,
      report: commitReport,
      signatures,
    })

    expect(commitResult.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: offRamp.address,
      success: true,
    })

    const merkleRootDeployments = commitResult.transactions.filter((tx) => {
      return (
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src instanceof Address &&
        tx.inMessage.info.src.equals(offRamp.address) &&
        tx.inMessage.info.dest instanceof Address &&
        !tx.inMessage.info.dest.equals(feeQuoter.address)
      )
    })

    expect(merkleRootDeployments.length).toBe(1)

    merkleRootDeployments.forEach((tx) => {
      expect(tx.description.type).toBe('generic')
      if (tx.description.type === 'generic') {
        expect(tx.description.aborted).toBe(false)
      }
    })

    const commitSnapshot = makeSnapshotMetric(store, {
      contractDatabase,
      label: `OffRamp Commit Phase`,
    })

    // Create address to name mapping
    const addressMap: Record<string, string> = {
      [transmitters[0].address.toString()]: 'Transmitter',
      [offRamp.address.toString()]: 'OffRamp',
      [feeQuoter.address.toString()]: 'FeeQuoter',
    }

    // Add MerkleRoot addresses
    merkleRootDeployments.forEach((tx, idx) => {
      if (tx.inMessage?.info.type === 'internal' && tx.inMessage.info.dest instanceof Address) {
        addressMap[tx.inMessage.info.dest.toString()] = `MerkleRoot-${idx + 1}`
      }
    })

    const commitFlowAnalysis = analyzeSnapshot(commitSnapshot, addressMap, commitResult)
    printFlowAnalysis(commitFlowAnalysis)

    console.log('\n=== COMMIT RAW TRANSACTION FEES (for debugging) ===')
    printTransactionFees(commitResult.transactions, opMapFunc())

    // Step 4: Execute phase
    const merkleHelper = new MerkleHelper()

    const messageIdForProof = uint8ArrayToBigInt(messageIdBytes)
    const { proof, root: proofRoot } = merkleHelper.createTreeAndProve([messageIdForProof], [0])

    let proofFlagBits = 0n
    for (let i = 0; i < proof.sourceFlags.length; i++) {
      if (proof.sourceFlags[i]) {
        proofFlagBits |= 1n << BigInt(i)
      }
    }

    const executeReport: ExecutionReport = {
      sourceChainSelector: CHAINSEL_EVM_TEST,
      messages: [testMessage],
      offchainTokenData: [],
      proofs: proof.hashes,
      proofFlagBits,
    }

    const executeReportContext: ReportContext = {
      configDigest,
      padding: 0n,
      sequenceBytes: 0x02,
    }

    resetMetricStore()

    const executeResult = await offRamp.sendExecute(transmitters[0].getSender(), {
      value: toNano('0.2'),
      reportContext: executeReportContext,
      report: executeReport,
    })

    expect(executeResult.transactions).toHaveTransaction({
      from: transmitters[0].address,
      to: offRamp.address,
      success: true,
    })

    const merkleRootValidation = executeResult.transactions.find((tx) => {
      return (
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage.info.src instanceof Address &&
        tx.inMessage.info.src.equals(offRamp.address) &&
        tx.inMessage.info.dest instanceof Address &&
        !tx.inMessage.info.dest.equals(feeQuoter.address) &&
        !tx.inMessage.info.dest.equals(receiver.address)
      )
    })

    expect(merkleRootValidation).toBeDefined()
    expect(merkleRootValidation?.description.type).toBe('generic')
    if (merkleRootValidation?.description.type === 'generic') {
      expect(merkleRootValidation.description.aborted).toBe(false)
    }

    const executeSnapshot = makeSnapshotMetric(store, {
      contractDatabase,
      label: `OffRamp Execute Phase`,
    })

    // Reuse address map (add receiver if needed)
    addressMap[receiver.address.toString()] = 'Receiver'

    const executeFlowAnalysis = analyzeSnapshot(executeSnapshot, addressMap, executeResult)
    printFlowAnalysis(executeFlowAnalysis)

    console.log('\n=== EXECUTE RAW TRANSACTION FEES (for debugging) ===')
    printTransactionFees(executeResult.transactions, opMapFunc())
  })
})

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
import * as rt from '../../../../wrappers/gen/ccip/Router'
import * as or from '../../../../wrappers/gen/ccip/OnRamp'
import { FeeQuoter } from '../../../../wrappers/gen/ccip/FeeQuoter'
import * as of from '../../../../wrappers/gen/ccip/OffRamp'
import '@ton/test-utils'
import {
  generateMockTonAddress,
  bigIntToBuffer,
  uint8ArrayToBigInt,
  generateEd25519KeyPair,
  WRAPPED_NATIVE,
} from '../../../../src/utils'
import { setupTestFeeQuoter } from '../../../ccip/helpers/SetUp'
import { Receiver, ReceiverBehavior } from '../../../../wrappers/examples/Receiver'
import {
  hashReport,
  OCR3_PLUGIN_TYPE_COMMIT,
  OCR3_PLUGIN_TYPE_EXECUTE,
  ReportContext,
} from '../../../../wrappers/libraries/ocr/MultiOCR3Base'
import { KeyPair, sha256_sync } from '@ton/crypto'
import { EVM_SENDER_ADDRESS_TEST, EVM_ONRAMP_ADDRESS_TEST } from '../../constants'
import { createMaxPayload, createExtraArgs, MESSAGE_COUNT_IN_COMMIT } from './config'
import { MerkleHelper } from '../../../lib/merkle_proof/helpers/MerkleMultiProofHelper'
import { analyzeSnapshot, printFlowAnalysis } from '../../utils'
import * as path from 'path'
import * as fs from 'fs'
import { opMapFunc } from './opMapFunc'
import { ContractClient as DeployableContract } from '../../../../wrappers/libraries/Deployable'
import * as mr from '../../../../wrappers/ccip/MerkleRoot'
import { ContractClient as CCIPSendExecutorContract } from '../../../../wrappers/ccip/CCIPSendExecutor'
import * as CrossChainAddressCodec from '../../../../wrappers/ccip/common/CrossChainAddressCodec'
import { asSnakedCell } from '../../../../src/utils'
import { contractCode } from '../../../../wrappers/codeLoader'
import { ChainSelectors } from '../../../utils/Selectors'
import generateMessageID, { getMetadataHash } from '../../../../src/offramp/generateMessageID'
import { createSignatures } from '../../../ccip/offramp/OffRamp.Setup'

const ROUTER_ADDRESS_TEST = generateMockTonAddress()

// Override console to remove Jest's "console.log" prefixes
const jestConsole = console

// Load contract database for metric analysis
const contractDatabasePath = path.join(__dirname, '../../../../contract.abi.json')
const contractDatabaseData = fs.existsSync(contractDatabasePath)
  ? JSON.parse(fs.readFileSync(contractDatabasePath, 'utf8'))
  : {}
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
  let offRamp: SandboxContract<of.OffRamp>
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
      let routerCode = await contractCode.ccip.local('Router')
      let data = rt.Storage.create({
        id: 0n,
        ownable: rt.Ownable2Step.create({
          owner: deployer.address,
        }),
        wrappedNative: WRAPPED_NATIVE,
        onRamps: new Map(),
        offRamps: new Map(),
        rmnRemote: rt.RMNRemote.create({
          admin: rt.Ownable2Step.create({ owner: deployer.address }),
          cursedSubjects: rt.CursedSubjects.create({ data: new Set() }),
          forwardUpdates: new Set(),
        }),
        tokenRegistryDeployment: rt.Router_TokenRegistryDeployment.create({
          deployableCode: deployerCode,
          tokenRegistryCode: await contractCode.ccip.local('TokenRegistry'),
        }),
      })
      router = blockchain.openContract(
        rt.Router.fromStorage(data, { overrideContractCode: routerCode }),
      )
      const result = await router.sendDeploy(deployer.getSender(), toNano('1'))
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
      const onRampData = or.OnRamp_Storage.create({
        id: 0n,
        ownable: or.Ownable2Step.create({
          owner: deployer.address,
        }),
        chainSelector: ChainSelectors.testnet.ton,
        config: or.OnRamp_DynamicConfig.create({
          feeQuoter: feeQuoter.address,
          feeAggregator: deployer.address,
          allowlistAdmin: deployer.address,
          reserve: toNano('1'),
        }),
        destChainConfigs: new Map(),
        executor: or.ExecutorDeployment.create({
          executorCode: await contractCode.ccip.local('CCIPSendExecutor'),
          deployableCode: await contractCode.ccip.local('Deployable'),
        }),
      })
      onRamp = blockchain.openContract(or.OnRamp.fromStorage(onRampData))
      const result = await onRamp.sendDeploy(deployer.getSender(), toNano('1'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: onRamp.address,
        deploy: true,
        success: true,
      })

      // Add onRamp to router
      const addResult = await router.sendRouterApplyRampUpdates(deployer.getSender(), toNano('1'), {
        queryId: 0n,
        onRampUpdates: rt.OnRamps.create({
          destChainSelectors: [ChainSelectors.testnet.evm],
          onRamp: onRamp.address,
        }),
      })
      expect(addResult.transactions).toHaveTransaction({
        to: router.address,
        success: true,
      })

      // Add destChainConfig to OnRamp
      const configResult = await onRamp.sendOnRampUpdateDestChainConfigs(
        deployer.getSender(),
        toNano('1'),
        {
          updates: [
            or.OnRampUpdateDestChainConfig.create({
              destChainSelector: ChainSelectors.testnet.evm,
              router: router.address,
              allowlistEnabled: false,
            }),
          ],
        },
      )
      expect(configResult.transactions).toHaveTransaction({
        to: onRamp.address,
        success: true,
      })
    }

    // Deploy OffRamp
    {
      let code = await contractCode.ccip.local('OffRamp')

      // Use a library reference for merkleRootCode
      let libPrep = beginCell().storeUint(2, 8).storeBuffer(merkleRootCodeRaw.hash()).endCell()
      let merkleRootCode = new Cell({ exotic: true, bits: libPrep.bits, refs: libPrep.refs })

      let data = of.Storage.create({
        id: 0n,
        ownable: of.Ownable2Step.create({
          owner: deployer.address,
        }),
        deployables: of.OffRamp_Deployables.create({
          rmnRouter: deployer.address,
          deployer: deployerCode,
          merkleRootCode,
          receiveExecutorCode: await contractCode.ccip.local('ReceiveExecutor'),
        }),
        feeQuoter: feeQuoter.address,
        ocr3Base: of.OCR3Base.create({
          chainId: 1n,
          commit: null,
          execute: null,
        }),
        cursedSubjects: of.CursedSubjects.create({
          data: new Set(),
        }),
        chainSelector: ChainSelectors.testnet.ton,
        permissionlessExecutionThresholdSeconds: 60n,
        sourceChainConfigs: new Map(),
        latestPriceSequenceNumber: 0n,
      })
      offRamp = blockchain.openContract(
        of.OffRamp.fromStorage(data, { overrideContractCode: code }),
      )
      const result = await offRamp.sendDeploy(deployer.getSender(), toNano('10000'))
      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: offRamp.address,
        deploy: true,
        success: true,
      })

      // Setup OCR configs
      const commitConfigResult = await offRamp.sendOCR3BaseSetOCR3Config(
        deployer.getSender(),
        toNano('100'),
        {
          configDigest,
          ocrPluginType: OCR3_PLUGIN_TYPE_COMMIT,
          bigF: 1n,
          isSignatureVerificationEnabled: true,
          signers: signersPublicKeys,
          transmitters: transmitters.map((t) => t.address),
        },
      )
      expect(commitConfigResult.transactions).toHaveTransaction({
        to: offRamp.address,
        success: true,
      })

      const executeConfigResult = await offRamp.sendOCR3BaseSetOCR3Config(
        deployer.getSender(),
        toNano('100'),
        {
          configDigest,
          ocrPluginType: OCR3_PLUGIN_TYPE_EXECUTE,
          bigF: 1n,
          isSignatureVerificationEnabled: false,
          signers: [],
          transmitters: transmitters.map((t) => t.address),
        },
      )
      expect(executeConfigResult.transactions).toHaveTransaction({
        to: offRamp.address,
        success: true,
      })

      // Setup source chain config
      const sourceChainConfigResult = await offRamp.sendOffRampUpdateSourceChainConfigs(
        deployer.getSender(),
        toNano('0.5'),
        {
          configs: [
            of.SourceChainConfigUpdate.create({
              sourceChainSelector: ChainSelectors.testnet.evm,
              config: of.SourceChainConfig.create({
                router: ROUTER_ADDRESS_TEST,
                isEnabled: true,
                minSeqNr: 1n,
                isRMNVerificationDisabled: false,
                onRamp: CrossChainAddressCodec.FromBuffer(bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST)),
              }),
            }),
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
    const testMessage: of.Any2TVMRampMessage = of.Any2TVMRampMessage.create({
      header: of.RampMessageHeader.create({
        messageId: 1n,
        sourceChainSelector: ChainSelectors.testnet.evm,
        destChainSelector: ChainSelectors.testnet.ton,
        sequenceNumber: 1n,
        nonce: 0n,
      }),
      gasLimit: 500000n,
      sender: CrossChainAddressCodec.FromBuffer(bigIntToBuffer(EVM_SENDER_ADDRESS_TEST)),
      data: maxPayload,
      receiver: receiver.address,
      tokenAmounts: null,
    })

    const metadataHash = getMetadataHash(
      ChainSelectors.testnet.evm,
      ChainSelectors.testnet.ton,
      CrossChainAddressCodec.FromBuffer(bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST)),
    )
    const messageIdForProof = generateMessageID(testMessage, metadataHash)

    // Step 2: Create merkle roots
    const merkleRoots: of.MerkleRoot[] = []
    merkleRoots.push(
      of.MerkleRoot.create({
        sourceChainSelector: ChainSelectors.testnet.evm,
        onRampAddress: CrossChainAddressCodec.FromBuffer(bigIntToBuffer(EVM_ONRAMP_ADDRESS_TEST)),
        minSeqNr: 1n,
        maxSeqNr: 10n,
        merkleRoot: messageIdForProof + 0n,
      }),
    )

    const commitReport: of.CommitReport = of.CommitReport.create({
      merkleRoots,
      priceUpdates: null,
    })

    const reportContext: ReportContext = {
      configDigest,
      padding: 0n,
      sequenceBytes: 0x01,
    }

    const signatures = createSignatures(
      [signers[0], signers[1]],
      hashReport(of.CommitReport.toCell(commitReport), reportContext),
    )

    // Step 3: Commit phase
    resetMetricStore()

    const commitResult = await offRamp.sendOffRampCommit(
      transmitters[0].getSender(),
      toNano('0.2'),
      {
        reportContext: of.ReportContext.create({
          configDigest,
          sequenceBytes: BigInt(reportContext.sequenceBytes),
        }),
        report: commitReport,
        signatures,
      },
    )

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

    const { proof, root: proofRoot } = merkleHelper.createTreeAndProve([messageIdForProof], [0])

    let proofFlagBits = 0n
    for (let i = 0; i < proof.sourceFlags.length; i++) {
      if (proof.sourceFlags[i]) {
        proofFlagBits |= 1n << BigInt(i)
      }
    }

    const executeReport: of.ExecutionReport = of.ExecutionReport.create({
      sourceChainSelector: ChainSelectors.testnet.evm,
      messages: asSnakedCell([testMessage], (msg) => {
        const b = beginCell()
        of.Any2TVMRampMessage.store(msg, b)
        return b
      }),
      offchainTokenData: Cell.EMPTY,
      proofs: proof.hashes,
      proofFlagBits,
    })

    const executeReportContext: ReportContext = {
      configDigest,
      padding: 0n,
      sequenceBytes: 0x02,
    }

    resetMetricStore()

    const executeResult = await offRamp.sendOffRampExecute(
      transmitters[0].getSender(),
      toNano('0.2'),
      {
        reportContext: of.ReportContext.create({
          configDigest,
          sequenceBytes: BigInt(executeReportContext.sequenceBytes),
        }),
        report: executeReport,
      },
    )

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

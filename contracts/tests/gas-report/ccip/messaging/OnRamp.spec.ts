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
import { toNano, Cell, Dictionary, Address } from '@ton/core'
import * as or from '../../../../wrappers/gen/ccip/OnRamp'
import * as rt from '../../../../wrappers/gen/ccip/Router'
import { FeeQuoter } from '../../../../wrappers/ccip/FeeQuoter'
import '@ton/test-utils'
import { WRAPPED_NATIVE } from '../../../../src/utils'
import { setupTestFeeQuoter } from '../../../ccip/helpers/SetUp'
import { createMaxPayload, createExtraArgs } from './config'
import { analyzeSnapshot, printFlowAnalysis } from '../../utils'
import * as path from 'path'
import * as fs from 'fs'
import { getValidatedFee } from '../../../../src/ccipSend/fee'
import { opMapFunc } from './opMapFunc'
import { contractCode } from '../../../../wrappers/codeLoader'
import { ChainFamilySelectors, ChainSelectors } from '../../../utils/Selectors'
import * as CrossChainAddressCodec from '../../../../wrappers/ccip/common/CrossChainAddressCodec'

const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
)

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

describe('CCIP OnRamp Gas Estimation', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let onRamp: SandboxContract<or.OnRamp>
  let feeQuoter: SandboxContract<FeeQuoter>
  let sender: SandboxContract<TreasuryContract>

  beforeEach(() => {
    global.console = require('console')
  })
  afterEach(() => {
    global.console = jestConsole
  })

  beforeAll(async () => {
    // Use default config (mainnet) to avoid rate limiting
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true
    deployer = await blockchain.treasury('deployer')
    sender = await blockchain.treasury('sender')

    // Deploy FeeQuoter
    feeQuoter = await setupTestFeeQuoter(deployer, blockchain)

    // Override FeeQuoter config for large payloads (gas testing)
    await feeQuoter.sendUpdateDestChainConfigs(deployer.getSender(), {
      value: toNano('1'),
      updates: [
        {
          destChainSelector: ChainSelectors.testnet.evm,
          config: {
            isEnabled: true,
            maxNumberOfTokensPerMsg: 0,
            maxDataBytes: 10000,
            maxPerMsgGasLimit: 100000,
            destGasOverhead: 0,
            destGasPerPayloadByteBase: 0,
            destGasPerPayloadByteHigh: 0,
            destGasPerPayloadByteThreshold: 0,
            destDataAvailabilityOverheadGas: 0,
            destGasPerDataAvailabilityByte: 0,
            destDataAvailabilityMultiplierBps: 0,
            chainFamilySelector: ChainFamilySelectors.evm,
            defaultTokenFeeUsdCents: 0,
            defaultTokenDestGasOverhead: 0,
            defaultTxGasLimit: 1,
            gasMultiplierWeiPerEth: 0n,
            gasPriceStalenessThreshold: 0,
            networkFeeUsdCents: 0,
          },
        },
      ],
    })

    // Deploy Router
    const routerCode = await contractCode.ccip.local('Router')
    const routerData = rt.Storage.create({
      id: 0n,
      ownable: rt.Ownable2Step.create({
        owner: deployer.address,
      }),
      wrappedNative: WRAPPED_NATIVE,
      offRamps: new Map(),
      onRamps: new Map(),
      rmnRemote: rt.RMNRemote.create({
        admin: rt.Ownable2Step.create({ owner: deployer.address }),
        cursedSubjects: rt.CursedSubjects.create({ data: new Set() }),
        forwardUpdates: new Set(),
      }),
      tokenRegistryDeployment: rt.Router_TokenRegistryDeployment.create({
        deployableCode: await contractCode.ccip.local('Deployable'),
        tokenRegistryCode: await contractCode.ccip.local('TokenRegistry'),
      }),
    })
    router = blockchain.openContract(
      rt.Router.fromStorage(routerData, { overrideContractCode: routerCode }),
    )
    await router.sendDeploy(deployer.getSender(), toNano('1'))

    // Deploy OnRamp
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
    await onRamp.sendDeploy(deployer.getSender(), toNano('1'))

    // Configure Router
    await router.sendRouterApplyRampUpdates(
      deployer.getSender(),
      toNano('0.1'),
      rt.Router_ApplyRampUpdates.create({
        queryId: 0n,
        onRampUpdates: rt.OnRamps.create({
          destChainSelectors: [ChainSelectors.testnet.evm],
          onRamp: onRamp.address,
        }),
      }),
    )

    // Configure OnRamp
    await onRamp.sendOnRampUpdateDestChainConfigs(deployer.getSender(), toNano('0.1'), {
      updates: [
        or.OnRampUpdateDestChainConfig.create({
          destChainSelector: ChainSelectors.testnet.evm,
          router: router.address,
          allowlistEnabled: false,
        }),
      ],
    })
  })

  it('should measure message passing only', async () => {
    // Reset metric store before measurement
    resetMetricStore()

    const msg = {
      queryID: 1,
      destChainSelector: ChainSelectors.testnet.evm,
      receiver: EVM_ADDRESS,
      data: createMaxPayload(),
      tokenAmounts: [],
      feeToken: WRAPPED_NATIVE,
      extraArgs: createExtraArgs(),
    }

    const generatedMsg = rt.Router_CCIPSend.create({
      queryID: 1n,
      destChainSelector: ChainSelectors.testnet.evm,
      receiver: CrossChainAddressCodec.FromBuffer(EVM_ADDRESS),
      data: msg.data,
      tokenAmounts: [],
      feeToken: msg.feeToken,
      extraArgs: rt.GenericExtraArgsV2.fromSlice(msg.extraArgs.beginParse()),
    })

    const fee = await getValidatedFee(blockchain, router.address, generatedMsg)
    console.log(`Validated fee for message: ${fee.toString()} nanotons`)

    const result = await router.sendRouterCCIPSend(
      sender.getSender(),
      fee + toNano('1'),
      generatedMsg,
    )

    // Assert all expected transactions
    expect(result.transactions).toHaveTransaction({
      from: sender.address,
      to: router.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: onRamp.address,
      success: true,
    })

    // Find executor address
    const executorAddress = ((): Address => {
      for (const tx of result.transactions) {
        if (
          tx.inMessage != null &&
          tx.inMessage.info.type === 'internal' &&
          tx.inMessage.info.src instanceof Address &&
          tx.inMessage.info.src.equals(onRamp.address) &&
          tx.inMessage.info.dest instanceof Address &&
          !tx.inMessage.info.dest.equals(feeQuoter.address)
        ) {
          return tx.inMessage.info.dest
        }
      }
      throw Error('Executor address not found')
    })()

    expect(result.transactions).toHaveTransaction({
      from: onRamp.address,
      to: executorAddress,
      deploy: true,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: executorAddress,
      to: feeQuoter.address,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: feeQuoter.address,
      to: executorAddress,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: executorAddress,
      to: onRamp.address,
      success: true,
    })

    // Analyze with metrics API
    const snapshot = makeSnapshotMetric(store, {
      contractDatabase,
      label: 'OnRamp Flow',
    })

    // Create address to name mapping
    const addressMap: Record<string, string> = {
      [sender.address.toString()]: 'Sender',
      [router.address.toString()]: 'Router',
      [onRamp.address.toString()]: 'OnRamp',
      [feeQuoter.address.toString()]: 'FeeQuoter',
      [executorAddress.toString()]: 'Executor',
    }

    const flowAnalysis = analyzeSnapshot(snapshot, addressMap, result)
    printFlowAnalysis(flowAnalysis)

    // Also print raw transaction fees for comparison
    console.log('\n=== RAW TRANSACTION FEES (for debugging) ===')
    printTransactionFees(result.transactions, opMapFunc())
  })
})

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
import { compile } from '@ton/blueprint'
import * as rt from '../../../../wrappers/ccip/Router'
import * as or from '../../../../wrappers/ccip/OnRamp'
import { FeeQuoter } from '../../../../wrappers/ccip/FeeQuoter'
import '@ton/test-utils'
import { WRAPPED_NATIVE } from '../../../../src/utils'
import { setupTestFeeQuoter } from '../../../ccip/helpers/SetUp'
import { CHAINSEL_TON, CHAINSEL_EVM_TEST, CHAIN_FAMILY_SELECTOR_EVM } from '../../constants'
import { createMaxPayload, createExtraArgs } from './config'
import { analyzeSnapshot, printFlowAnalysis } from '../../utils'
import * as path from 'path'
import * as fs from 'fs'
import { getValidatedFee } from '../../../../src/ccipSend/fee'
import { opMapFunc } from './opMapFunc'

const EVM_ADDRESS = Buffer.from(
  '0000000000000000000000001234567890123456789012345678901234567890',
  'hex',
)

// Override console to remove Jest's "console.log" prefixes
const jestConsole = console

// Load contract database for metric analysis
const contractDatabasePath = path.join(__dirname, '../../../../contract.abi.json')
const contractDatabaseData = JSON.parse(fs.readFileSync(contractDatabasePath, 'utf8'))
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
          destChainSelector: CHAINSEL_EVM_TEST,
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
            chainFamilySelector: CHAIN_FAMILY_SELECTOR_EVM,
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
    const routerCode = await compile('Router')
    const routerData: rt.Storage = {
      id: 0n,
      ownable: {
        owner: deployer.address,
        pendingOwner: null,
      },
      wrappedNative: WRAPPED_NATIVE,
      offRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
      onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
    }
    router = blockchain.openContract(rt.Router.createFromConfig(routerData, routerCode))
    await router.sendInternal(deployer.getSender(), toNano('1'), Cell.EMPTY)

    // Deploy OnRamp
    const code = await compile('OnRamp')
    const onRampData: or.OnRampStorage = {
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
        executorCode: await compile('CCIPSendExecutor'),
        deployableCode: await compile('Deployable'),
      },
    }
    onRamp = blockchain.openContract(or.OnRamp.createFromConfig(onRampData, code))
    await onRamp.sendDeploy(deployer.getSender(), toNano('1'))

    // Configure Router
    await router.sendApplyRampUpdatesSetRamps(deployer.getSender(), {
      value: toNano('0.1'),
      data: {
        queryID: BigInt(0),
        onRamps: {
          destChainSelectors: [CHAINSEL_EVM_TEST],
          onRamp: onRamp.address,
        },
      },
    })

    // Configure OnRamp
    await onRamp.sendUpdateDestChainConfigs(deployer.getSender(), {
      value: toNano('0.1'),
      destChainConfigs: [
        {
          destChainSelector: CHAINSEL_EVM_TEST,
          router: router.address,
          allowlistEnabled: false,
        },
      ],
    })
  })

  it('should measure message passing only', async () => {
    // Reset metric store before measurement
    resetMetricStore()

    const msg = {
      queryID: 1,
      destChainSelector: CHAINSEL_EVM_TEST,
      receiver: EVM_ADDRESS,
      data: createMaxPayload(),
      tokenAmounts: [],
      feeToken: WRAPPED_NATIVE,
      extraArgs: createExtraArgs(),
    }

    const fee = await getValidatedFee(blockchain, router.address, msg)
    console.log(`Validated fee for message: ${fee.toString()} nanotons`)

    const result = await router.sendCcipSend(sender.getSender(), {
      value: fee + toNano('0.19'),
      body: msg,
    })

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

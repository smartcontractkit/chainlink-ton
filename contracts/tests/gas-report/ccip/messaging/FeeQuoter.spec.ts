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
import { compile } from '@ton/blueprint'
import * as rt from '../../../../wrappers/ccip/Router'
import * as or from '../../../../wrappers/ccip/OnRamp'
import * as fq from '../../../../wrappers/ccip/FeeQuoter'
import '@ton/test-utils'
import { ZERO_ADDRESS } from '../../../../src/utils'
import { setupTestFeeQuoter } from '../../../ccip/helpers/SetUp'
import { CHAINSEL_TON, CHAINSEL_EVM_TEST, CHAIN_FAMILY_SELECTOR_EVM } from '../../constants'
import { createMaxPayload, createExtraArgs } from './config'
import { analyzeSnapshot, printFlowAnalysis } from '../../utils'
import * as path from 'path'
import * as fs from 'fs'
import { ContractClient as Ownable } from '../../../../wrappers/libraries/access/Ownable2Step'
import { OpMapFunc } from '@ton/sandbox/dist/utils/printTransactionFees'

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

describe('CCIP FeeQuoter Gas Estimation', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let onRamp: SandboxContract<or.OnRamp>
  let feeQuoter: SandboxContract<fq.FeeQuoter>
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
      wrappedNative: ZERO_ADDRESS,
      offRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
      onRamps: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Address()),
    }
    router = blockchain.openContract(rt.Router.createFromConfig(routerData, routerCode))
    await router.sendInternal(deployer.getSender(), toNano('1'), Cell.EMPTY)

    // Deploy OnRamp
    const code = await compile('OnRamp')
    const onRampData: or.OnRampStorage = {
      id: 0,
      ownable: {
        owner: deployer.address,
        pendingOwner: null,
      },
      chainSelector: CHAINSEL_TON,
      config: {
        feeQuoter: feeQuoter.address,
        feeAggregator: deployer.address,
        allowlistAdmin: deployer.address,
      },
      destChainConfigs: Dictionary.empty(Dictionary.Keys.BigUint(64), Dictionary.Values.Cell()),
      executor: {
        currentID: 0n,
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

  it('should measure fee validation', async () => {
    // Reset metric store before measurement
    resetMetricStore()

    const result = await router.sendGetValidatedFee(
      sender.getSender(),
      toNano('0.11'),
      {
        queryID: 1,
        destChainSelector: CHAINSEL_EVM_TEST,
        receiver: EVM_ADDRESS,
        data: createMaxPayload(),
        tokenAmounts: [],
        feeToken: ZERO_ADDRESS,
        extraArgs: createExtraArgs(),
      },
      beginCell().asSlice(),
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

    // Analyze with metrics API
    const snapshot = makeSnapshotMetric(store, {
      contractDatabase,
      label: 'Fee Validation Flow',
    })

    // Create address to name mapping
    const addressMap: Record<string, string> = {
      [sender.address.toString()]: 'Sender',
      [router.address.toString()]: 'Router',
      [onRamp.address.toString()]: 'OnRamp',
      [feeQuoter.address.toString()]: 'FeeQuoter',
    }

    const flowAnalysis = analyzeSnapshot(snapshot, addressMap, result)
    printFlowAnalysis(flowAnalysis)

    const opcodeMap = new Map<number, string>()
    Object.entries(fq.Opcodes).forEach(([name, code]) => {
      opcodeMap.set(code, `FeeQuoter::${name}`)
    })
    Object.entries(or.Opcodes).forEach(([name, code]) => {
      opcodeMap.set(code, `OnRamp::${name}`)
    })
    Object.entries(rt.Opcodes).forEach(([name, code]) => {
      opcodeMap.set(code, `Router::${name}`)
    })
    const mapFunc: OpMapFunc = (op: number) => {
      return opcodeMap.get(op)
    }

    // Also print raw transaction fees for comparison
    console.log('\n=== RAW TRANSACTION FEES (for debugging) ===')
    printTransactionFees(result.transactions, mapFunc)
  })
})

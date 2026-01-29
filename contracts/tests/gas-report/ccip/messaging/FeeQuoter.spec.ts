import {
  Blockchain,
  SandboxContract,
  TreasuryContract,
  printTransactionFees,
  createMetricStore,
  makeSnapshotMetric,
  ContractDatabase,
  resetMetricStore,
  BlockchainTransaction,
} from '@ton/sandbox'
import { toNano, Cell, Dictionary, Address, beginCell } from '@ton/core'
import { compile } from '@ton/blueprint'
import * as rt from '../../../../wrappers/ccip/Router'
import * as or from '../../../../wrappers/ccip/OnRamp'
import * as fq from '../../../../wrappers/ccip/FeeQuoter'
import '@ton/test-utils'
import { WRAPPED_NATIVE } from '../../../../src/utils'
import { setupTestFeeQuoter } from '../../../ccip/helpers/SetUp'
import { CHAINSEL_TON, CHAINSEL_EVM_TEST, CHAIN_FAMILY_SELECTOR_EVM } from '../../constants'
import { createMaxPayload, createExtraArgs, MAX_DATA_PAYLOAD_SIZE, createPayload } from './config'
import { analyzeSnapshot, printFlowAnalysis, formatRow } from '../../utils'
import * as path from 'path'
import * as fs from 'fs'
import { ContractClient as Ownable } from '../../../../wrappers/libraries/access/Ownable2Step'
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

  it('should measure fee validation', async () => {
    // Reset metric store before measurement

    const payload = createMaxPayload()
    const result = await messureGetValidatedFee(router, sender, payload, onRamp, feeQuoter)

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

    // Also print raw transaction fees for comparison
    console.log('\n=== RAW TRANSACTION FEES (for debugging) ===')
    printTransactionFees(result.transactions, opMapFunc())
  })

  it('should compare gas cost of different payload sizes', async () => {
    // array from 0 to MAX_DATA_PAYLOAD_SIZE in steps of 1
    const payloadSizes: number[] = []
    for (let size = 0; size <= MAX_DATA_PAYLOAD_SIZE; size += 127) {
      payloadSizes.push(size)
    }

    const gasUsages: {
      size: number
      gasUsed: bigint
      computeFee: bigint
    }[] = []

    for (const size of payloadSizes) {
      const payload = createPayload(size)
      const result = await messureGetValidatedFee(router, sender, payload, onRamp, feeQuoter)
      const tx: BlockchainTransaction = result.transactions.find(
        (tx) =>
          tx.inMessage?.info.src instanceof Address && tx.inMessage.info.src.equals(onRamp.address),
      )!
      if (
        !tx.inMessage ||
        tx.inMessage.info.type !== 'internal' ||
        tx.description.type !== 'generic' ||
        tx.description.computePhase.type !== 'vm'
      ) {
        throw new Error('Expected internal message')
      }

      gasUsages.push({
        size,
        gasUsed: tx.description.computePhase.gasUsed,
        computeFee: tx.description.computePhase.gasFees,
      })
    }

    // Print table using utility functions
    console.log('\n=== GAS COST BY PAYLOAD SIZE ===\n')

    const COL_WIDTHS = [15, 15, 20, 20, 20]
    const headers = ['Payload (bytes)', 'Gas Used', 'Compute Fee (TON)', 'Rate (nano/byte)']
    console.log(formatRow(headers, COL_WIDTHS))
    console.log(formatRow(['---', '---', '---', '---'], COL_WIDTHS))

    // print 1 every 100
    let summaryOutput = ''
    let csvOutput = ''
    gasUsages.forEach(({ size, gasUsed, computeFee }) => {
      const feeTON = (Number(computeFee) / 1e9).toFixed(9)
      const rate = size === 0 ? '∞' : (Number(computeFee) / size).toFixed(2).toString()
      const cells = [size.toString(), gasUsed.toString(), feeTON, rate]
      // console.log(formatRow(cells, COL_WIDTHS))
      summaryOutput += formatRow(cells, COL_WIDTHS) + '\n'
      csvOutput += `${size},${feeTON}\n`
    })

    console.log(`Summary:\n${summaryOutput}`)
    console.log(`CSV:\n${csvOutput}`)
  })
})

async function messureGetValidatedFee(
  router: SandboxContract<rt.Router>,
  sender: SandboxContract<TreasuryContract>,
  payload: Cell,
  onRamp: SandboxContract<or.OnRamp>,
  feeQuoter: SandboxContract<fq.FeeQuoter>,
) {
  resetMetricStore()
  const result = await router.sendGetValidatedFee(
    sender.getSender(),
    toNano('0.125'),
    {
      queryID: 1,
      destChainSelector: CHAINSEL_EVM_TEST,
      receiver: EVM_ADDRESS,
      data: payload,
      tokenAmounts: [],
      feeToken: WRAPPED_NATIVE,
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

  expect(result.transactions).toHaveTransaction({
    from: onRamp.address,
    to: feeQuoter.address,
    success: true,
  })

  expect(result.transactions).toHaveTransaction({
    from: feeQuoter.address,
    to: onRamp.address,
    success: true,
    op: fq.opcodes.out.messageValidated,
  })
  return result
}

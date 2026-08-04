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
import { toNano, Cell, Address, beginCell } from '@ton/core'
import * as rt from '../../../../wrappers/gen/ccip/Router'
import * as or from '../../../../wrappers/gen/ccip/OnRamp'
import * as fq from '../../../../wrappers/gen/ccip/FeeQuoter'
import '@ton/test-utils'
import { WRAPPED_NATIVE } from '../../../../src/utils'
import { setupTestFeeQuoter } from '../../../ccip/helpers/SetUp'
import { createMaxPayload, createExtraArgs, MAX_DATA_PAYLOAD_SIZE, createPayload } from './config'
import { analyzeSnapshot, printFlowAnalysis, formatRow } from '../../utils'
import * as path from 'path'
import * as fs from 'fs'
import { opMapFunc } from './opMapFunc'
import { contractCode } from '../../../../wrappers/codeLoader'
import { ChainFamilySelectors, ChainSelectors } from '../../../utils/Selectors'

const EVM_ADDRESS = beginCell()
  .storeBuffer(
    Buffer.from('0000000000000000000000001234567890123456789012345678901234567890', 'hex'),
  )
  .asSlice()

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
    await feeQuoter.sendFeeQuoterUpdateDestChainConfigs(deployer.getSender(), toNano('1'), {
      updates: [
        fq.FeeQuoter_UpdateDestChainConfig.create({
          destChainSelector: ChainSelectors.testnet.evm,
          destChainConfig: fq.FeeQuoterDestChainConfig.create({
            isEnabled: true,
            maxNumberOfTokensPerMsg: 0n,
            maxDataBytes: 10000n,
            maxPerMsgGasLimit: 100000n,
            destGasOverhead: 0n,
            destGasPerPayloadByteBase: 0n,
            destGasPerPayloadByteHigh: 0n,
            destGasPerPayloadByteThreshold: 0n,
            destDataAvailabilityOverheadGas: 0n,
            destGasPerDataAvailabilityByte: 0n,
            destDataAvailabilityMultiplierBps: 0n,
            chainFamilySelector: ChainFamilySelectors.evm,
            defaultTokenFeeUsdCents: 0n,
            defaultTokenDestGasOverhead: 0n,
            defaultTxGasLimit: 1n,
            gasMultiplierWeiPerEth: 0n,
            gasPriceStalenessThreshold: 0n,
            networkFeeUsdCents: 0n,
          }),
        }),
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
    await router.sendRouterApplyRampUpdates(deployer.getSender(), toNano('0.1'), {
      queryId: 0n,
      onRampUpdates: rt.OnRamps.create({
        destChainSelectors: [ChainSelectors.testnet.evm],
        onRamp: onRamp.address,
      }),
    })

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
  const result = await router.sendRouterGetValidatedFeeAny(
    sender.getSender(),
    toNano('1'),
    rt.Router_GetValidatedFee.create({
      ccipSend: rt.Router_CCIPSend.create({
        queryID: 1n,
        destChainSelector: ChainSelectors.testnet.evm,
        receiver: EVM_ADDRESS,
        data: payload,
        tokenAmounts: [],
        feeToken: WRAPPED_NATIVE,
        extraArgs: rt.GenericExtraArgsV2.fromSlice(createExtraArgs().beginParse()),
      }),
      context: Cell.EMPTY.asSlice(),
    }),
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
    op: fq.FeeQuoter_MessageValidated.PREFIX,
  })
  return result
}

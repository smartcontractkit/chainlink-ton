import { Blockchain, SandboxContract, TreasuryContract, BlockchainTransaction } from '@ton/sandbox'
import { toNano, Cell, Address } from '@ton/core'
import * as rt from '../../../../wrappers/gen/ccip/Router'
import { Costs, createCursePolicy } from '../../../../wrappers/ccip/Router'
import * as or from '../../../../wrappers/gen/ccip/OnRamp'
import * as fq from '../../../../wrappers/gen/ccip/FeeQuoter'
import '@ton/test-utils'
import { NATIVE_GRAM } from '../../../../src/utils'
import { setupTestFeeQuoter } from '../../../ccip/helpers/SetUp'
import { createExtraArgs, createPayload, HARD_MAX_DATA_BYTES } from './config'
import { AddressBook, formatRow, GasReport, gasReportConfig } from '../../utils'
import { contractCode } from '../../../../wrappers/codeLoader'
import { ChainFamilySelectors, ChainSelectors } from '../../../utils/Selectors'
import EVM_ADDRESS from '../../../utils/evmAddress'

const jestConsole = console

describe('CCIP FeeQuoter Gas Estimation', () => {
  let blockchain: Blockchain
  let report: GasReport
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
  afterAll(() => report.finish())

  beforeAll(async () => {
    blockchain = await Blockchain.create({ config: await gasReportConfig() })
    report = new GasReport('messaging-feequoter', blockchain)
    deployer = await blockchain.treasury('deployer')
    sender = await blockchain.treasury('sender')

    feeQuoter = await setupTestFeeQuoter(deployer, blockchain)

    await feeQuoter.sendFeeQuoterUpdateDestChainConfigs(deployer.getSender(), toNano('1'), {
      updates: [
        fq.FeeQuoter_UpdateDestChainConfig.create({
          destChainSelector: ChainSelectors.testnet.evm,
          destChainConfig: fq.FeeQuoterDestChainConfig.create({
            isEnabled: true,
            maxNumberOfTokensPerMsg: 0n,
            maxDataBytes: 40000n,
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

    const routerCode = await contractCode.ccip.local('Router')
    const routerData = rt.Storage.create({
      id: 0n,
      ownable: rt.Ownable2Step.create({ owner: deployer.address }),
      offRamps: new Map(),
      onRamps: new Map(),
      rmnRemote: rt.RMNRemote.create({
        policy: createCursePolicy(deployer.address),
        forwardUpdates: new Set(),
      }),
    })
    router = blockchain.openContract(
      rt.Router.fromStorage(routerData, { overrideContractCode: routerCode }),
    )
    await router.sendDeploy(deployer.getSender(), toNano('1'))

    const onRampData = or.OnRamp_Storage.create({
      id: 0n,
      ownable: or.Ownable2Step.create({ owner: deployer.address }),
      staticConfig: or.OnRamp_StaticConfig.create({
        chainSelector: ChainSelectors.testnet.ton,
        tokenAdminRegistry: deployer.address,
      }),
      config: or.OnRamp_DynamicConfig.create({
        feeQuoter: feeQuoter.address,
        feeAggregator: deployer.address,
        allowlistAdmin: deployer.address,
        reserve: toNano('1'),
      }),
      destChainConfigs: new Map(),
    })
    onRamp = blockchain.openContract(
      or.OnRamp.fromStorage(onRampData, {
        overrideContractCode: await contractCode.ccip.local('OnRamp'),
      }),
    )
    await onRamp.sendDeploy(deployer.getSender(), toNano('1'))

    await router.sendRouterApplyRampUpdates(deployer.getSender(), toNano('0.1'), {
      queryId: 0n,
      onRampUpdates: rt.OnRamps.create({
        destChainSelectors: [ChainSelectors.testnet.evm],
        onRamp: onRamp.address,
      }),
    })
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

  it(`should measure fee validation with ${HARD_MAX_DATA_BYTES} bytes of data`, async () => {
    await report.measure('Fee Validation + Max Payload', {
      run: () =>
        measureGetValidatedFee(
          router,
          sender,
          createPayload(HARD_MAX_DATA_BYTES),
          onRamp,
          feeQuoter,
        ),
      book: new AddressBook({
        Sender: [sender, 'external'],
        Router: [router, 'ccip'],
        OnRamp: [onRamp, 'ccip'],
        FeeQuoter: [feeQuoter, 'ccip'],
      }),
      budget: Costs.getValidatedFee,
    })
  })

  it('should compare the FeeQuoter gas cost of different payload sizes', async () => {
    const payloadSizes: number[] = []
    for (let size = 0; size <= HARD_MAX_DATA_BYTES; size += 127 * 16) {
      payloadSizes.push(size)
    }
    payloadSizes.push(HARD_MAX_DATA_BYTES)

    const gasUsages: { size: number; gasUsed: bigint; computeFee: bigint }[] = []
    for (const size of payloadSizes) {
      const payload = createPayload(size)
      const result = await measureGetValidatedFee(router, sender, payload, onRamp, feeQuoter)
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

    console.log('\n=== FEEQUOTER GAS COST BY PAYLOAD SIZE ===\n')
    const COL_WIDTHS = [15, 15, 20, 20]
    console.log(
      formatRow(
        ['Payload (bytes)', 'Gas Used', 'Compute Fee (TON)', 'Rate (nano/byte)'],
        COL_WIDTHS,
      ),
    )
    for (const { size, gasUsed, computeFee } of gasUsages) {
      const feeTON = (Number(computeFee) / 1e9).toFixed(9)
      const rate = size === 0 ? '-' : (Number(computeFee) / size).toFixed(2)
      console.log(formatRow([size.toString(), gasUsed.toString(), feeTON, rate], COL_WIDTHS))
    }
  })
})

async function measureGetValidatedFee(
  router: SandboxContract<rt.Router>,
  sender: SandboxContract<TreasuryContract>,
  payload: Cell,
  onRamp: SandboxContract<or.OnRamp>,
  feeQuoter: SandboxContract<fq.FeeQuoter>,
) {
  const result = await router.sendRouterGetValidatedFee(
    sender.getSender(),
    Costs.getValidatedFee,
    rt.Router_GetValidatedFee.create({
      ccipSend: rt.Router_CCIPSend.create({
        queryID: 1n,
        destChainSelector: ChainSelectors.testnet.evm,
        receiver: EVM_ADDRESS,
        data: payload,
        tokenAmounts: [],
        feeToken: NATIVE_GRAM,
        extraArgs: rt.GenericExtraArgsV2.fromSlice(createExtraArgs().beginParse()),
      }),
    }),
  )
  expect(result.transactions).toHaveTransaction({
    from: feeQuoter.address,
    to: onRamp.address,
    success: true,
    op: fq.FeeQuoter_MessageValidated.PREFIX,
  })
  return result
}

import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox'
import { toNano, Address, Cell } from '@ton/core'
import * as or from '../../../../wrappers/gen/ccip/OnRamp'
import * as rt from '../../../../wrappers/gen/ccip/Router'
import { Costs, createCursePolicy } from '../../../../wrappers/ccip/Router'
import * as fq from '../../../../wrappers/gen/ccip/FeeQuoter'
import * as deployable from '../../../../wrappers/libraries/Deployable'
import '@ton/test-utils'
import { NATIVE_GRAM } from '../../../../src/utils'
import { setupTestFeeQuoter } from '../../../ccip/helpers/SetUp'
import { createExtraArgs, createPayload, HARD_MAX_DATA_BYTES, SEND_DATA_SIZE_SWEEP } from './config'
import { AddressBook, GasReport, gasReportConfig } from '../../utils'
import { getValidatedFee } from '../../../../src/ccipSend/fee'
import { contractCode } from '../../../../wrappers/codeLoader'
import { ChainFamilySelectors, ChainSelectors } from '../../../utils/Selectors'
import EVM_ADDRESS from '../../../utils/evmAddress'

const jestConsole = console

describe('CCIP OnRamp Gas Estimation', () => {
  let blockchain: Blockchain
  let report: GasReport
  let deployer: SandboxContract<TreasuryContract>
  let router: SandboxContract<rt.Router>
  let onRamp: SandboxContract<or.OnRamp>
  let feeQuoter: SandboxContract<fq.FeeQuoter>
  let sender: SandboxContract<TreasuryContract>
  let book: AddressBook

  beforeEach(() => {
    global.console = require('console')
  })
  afterEach(() => {
    global.console = jestConsole
  })
  afterAll(() => report.finish())

  beforeAll(async () => {
    blockchain = await Blockchain.create({ config: await gasReportConfig() })
    report = new GasReport('messaging-onramp', blockchain)
    deployer = await blockchain.treasury('deployer')
    sender = await blockchain.treasury('sender')

    feeQuoter = await setupTestFeeQuoter(deployer, blockchain)

    // Lift the lane limits so the data size sweep passes fee validation.
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
    await onRamp.sendOnRampUpdateDestChainConfigs(deployer.getSender(), toNano('0.1'), {
      updates: [
        or.OnRampUpdateDestChainConfig.create({
          destChainSelector: ChainSelectors.testnet.evm,
          router: router.address,
          allowlistEnabled: false,
        }),
      ],
    })

    book = new AddressBook({
      Sender: [sender, 'external'],
      Router: [router, 'ccip'],
      OnRamp: [onRamp, 'ccip'],
      FeeQuoter: [feeQuoter, 'ccip'],
    })
  })

  async function ccipSend(data: Cell) {
    const msg = rt.Router_CCIPSend.create({
      queryID: 1n,
      destChainSelector: ChainSelectors.testnet.evm,
      receiver: EVM_ADDRESS,
      data,
      tokenAmounts: [],
      feeToken: NATIVE_GRAM,
      extraArgs: rt.GenericExtraArgsV2.fromSlice(createExtraArgs().beginParse()),
    })
    const fee = await getValidatedFee(blockchain, router.address, msg)
    return router.sendRouterCCIPSend(sender.getSender(), fee + Costs.ccipSend, msg)
  }

  function nameExecutor(result: SendMessageResult) {
    for (const tx of result.transactions) {
      const inMsg = tx.inMessage
      if (
        inMsg?.info.type === 'internal' &&
        inMsg.info.src instanceof Address &&
        inMsg.info.src.equals(onRamp.address) &&
        inMsg.body.beginParse().preloadUint(32) === deployable.opcodes.in.initializeAndSend
      ) {
        book.set('SendExecutor', inMsg.info.dest, 'ccip')
        return
      }
    }
    throw new Error('CCIPSendExecutor not found')
  }

  function expectACK(result: SendMessageResult) {
    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: sender.address,
      op: rt.Router_CCIPSendACK.PREFIX,
    })
  }

  it(`should measure message passing with ${HARD_MAX_DATA_BYTES} bytes of data`, async () => {
    const { result } = await report.measure('CCIPSend + Max Payload', {
      run: () => ccipSend(createPayload(HARD_MAX_DATA_BYTES)),
      book,
      discover: nameExecutor,
      budget: Costs.ccipSend,
    })
    expectACK(result)
  })

  it('should measure how the message cost scales with data size', async () => {
    for (const size of SEND_DATA_SIZE_SWEEP) {
      const { result } = await report.measure(`sweep: CCIPSend + ${size} bytes`, {
        run: () => ccipSend(createPayload(size)),
        book,
        discover: nameExecutor,
        budget: Costs.ccipSend,
      })
      expectACK(result)
    }
  })
})

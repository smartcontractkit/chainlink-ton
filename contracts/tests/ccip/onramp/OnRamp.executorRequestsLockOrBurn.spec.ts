import { Address, beginCell, Sender, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as ex from '../../../wrappers/gen/ccip/CCIPSendExecutor'
import * as dep from '../../../wrappers/libraries/Deployable'
import * as bouncer from '../../../wrappers/test/mock/Bouncer'
import { contractCode } from '../../../wrappers/codeLoader'
import { FromBuffer } from '../../../wrappers/ccip/common/CrossChainAddressCodec'
import { ChainSelectors } from '../../utils/Selectors'
import { setup } from './OnRamp.Setup'
import { findTransactionRequired } from '@ton/test-utils'

const EVM_ADDRESS = Buffer.from(
  '000000000000000000000000abababababababababababababababababababab',
  'hex',
)

const DEST_CHAIN_SELECTOR = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001

describe('OnRamp - ExecutorRequestsLockOrBurn', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let mockRouter: SandboxContract<TreasuryContract>
  let mockTokenPool: SandboxContract<TreasuryContract>
  let executorAddress: Address
  let executorSender: Sender
  let executorID: bigint

  beforeAll(async () => {
    blockchain = await Blockchain.create()
    blockchain.verbosity.debugLogs = true

    if (process.env['COVERAGE'] === 'true') {
      blockchain.enableCoverage()
      blockchain.verbosity.print = false
      blockchain.verbosity.vmLogs = 'vm_logs_verbose'
    }
  })

  beforeEach(async () => {
    mockRouter = await blockchain.treasury('mockRouter')
    mockTokenPool = await blockchain.treasury('mockTokenPool')
    ;({ deployer, onramp } = await setup(blockchain, {
      config: {
        feeQuoter: (await blockchain.treasury('mockFeeQuoter')).address,
      },
    }))

    await setRouter(mockRouter.address)

    executorSender = await deployRealExecutor()
  })

  const setRouter = async (router: Address) => {
    const result = await onramp.sendOnRampUpdateDestChainConfigs(
      deployer.getSender(),
      toNano('0.5'),
      {
        updates: [
          or.OnRampUpdateDestChainConfig.create({
            destChainSelector: DEST_CHAIN_SELECTOR,
            router,
            allowlistEnabled: false,
          }),
        ],
      },
    )
    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: onramp.address,
      success: true,
    })
  }

  // Deploys a real executor through OnRamp_Send and returns a sender bound to its address,
  // so the OnRamp's executor-address authorization passes.
  async function deployRealExecutor(): Promise<Sender> {
    const result = await onramp.sendOnRampSend(mockRouter.getSender(), toNano('4'), {
      msg: or.Router_CCIPSend.create({
        queryID: 1n,
        destChainSelector: DEST_CHAIN_SELECTOR,
        receiver: FromBuffer(EVM_ADDRESS),
        data: beginCell().endCell(),
        tokenAmounts: [],
        feeToken: null,
        extraArgs: or.GenericExtraArgsV2.create({
          gasLimit: 100n,
          allowOutOfOrderExecution: true,
        }),
      }),
      metadata: or.Metadata.create({
        sender: deployer.address,
        value: toNano('42'),
      }),
    })
    const deployTX = findTransactionRequired(result.transactions, { from: onramp.address })
    if (!deployTX.inMessage) throw new Error('Executor deploy transaction not found')
    const dest = deployTX.inMessage.info.dest
    if (!(dest instanceof Address)) throw new Error('Executor address not found')

    // Read the executor ID from the deploy message's state-init data (the executor mutates
    // its own storage during execution, so the live account data no longer matches).
    const deployMessage = dep.builder.messages.in.initializeAndSend.load(
      deployTX.inMessage.body.beginParse(),
    )
    executorID = ex.CCIPSendExecutor_InitialData.fromSlice(
      deployMessage.stateInit.data.beginParse(),
    ).id
    executorAddress = dest

    return blockchain.sender(dest)
  }

  const sendLockOrBurn = async () =>
    onramp.sendOnRampExecutorRequestsLockOrBurn(executorSender, toNano('1'), {
      queryID: 7n,
      tokenAmount: or.TokenAmount.create({ amount: 1n, token: deployer.address }),
      tokenPool: mockTokenPool.address,
      destChainSelector: DEST_CHAIN_SELECTOR,
      executorID,
      receiver: FromBuffer(EVM_ADDRESS),
      originalSender: deployer.address,
    })

  it('forwards the lock-or-burn request to the router', async () => {
    const result = await sendLockOrBurn()

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.Router_LockOrBurn.PREFIX,
      body(x) {
        if (!x) return false
        const request = rt.Router_LockOrBurn.fromSlice(x.beginParse())
        return (
          request.queryID === 7n &&
          request.tokenPool.equals(mockTokenPool.address) &&
          request.executorAddress.equals(executorAddress)
        )
      },
    })
  })

  it('notifies the executor when the router bounces the request', async () => {
    // The executor was deployed through the mock Router; now the lane's Router rejects everything.
    const routerBouncer = blockchain.openContract(
      bouncer.ContractClient.createFromConfig(await contractCode.ccip.local('tests.mock.Bouncer')),
    )
    await routerBouncer.sendDeploy(deployer.getSender(), toNano('0.05'))
    await setRouter(routerBouncer.address)

    const result = await sendLockOrBurn()

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: routerBouncer.address,
      success: false,
      op: rt.Router_LockOrBurn.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: routerBouncer.address,
      to: onramp.address,
      success: true,
      op: 0xfffffffe,
    })
    // The failure carries the request's queryId and the Router's exit code (the Bouncer throws
    // 0xFFFF).
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: executorAddress,
      op: or.OnRamp_LockOrBurnFailed.PREFIX,
      body(x) {
        if (!x) return false
        const failed = or.OnRamp_LockOrBurnFailed.fromSlice(x.beginParse())
        return failed.queryId === 7n && failed.errorCode === 0xffffn
      },
    })
  })
})

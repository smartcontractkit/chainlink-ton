import { Address, beginCell, Sender, toNano } from '@ton/core'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'

import { generateRandomContractId } from '../../../src/utils'

import * as or from '../../../wrappers/gen/ccip/OnRamp'
import * as rt from '../../../wrappers/gen/ccip/Router'
import * as ex from '../../../wrappers/gen/ccip/CCIPSendExecutor'
import * as dep from '../../../wrappers/libraries/Deployable'
import * as tp from '../../../wrappers/gen/ccip/pools/TokenPool'
import { setup } from './OnRamp.Setup'
import { ChainFamilySelectors, ChainSelectors } from '../../utils/Selectors'
import { FromBuffer } from '../../../wrappers/ccip/common/CrossChainAddressCodec'
import { findTransactionRequired } from '@ton/test-utils'

// Valid EVM destination token address: 32-byte abi-encoded, <= uint160, >= precompile space.
const VALID_EVM_TOKEN_ADDRESS = Buffer.from(
  '000000000000000000000000abababababababababababababababababababab',
  'hex',
)

const DEST_CHAIN_SELECTOR = ChainSelectors.testselectors.CHAINSEL_EVM_TEST_90000001

// Builds the pool-supplied forward payload the CCIPSendExecutor would relay inside the
// withdraw request. Only `prepared.out.destTokenAddress` matters for these tests.
function buildWithdrawRequest(opts: {
  accountWalletAddress: Address
  depositAccount: Address
  tokenPool: Address
  destTokenAddress: Buffer
  originalSender: Address
}): rt.Router_WithdrawRequest {
  const requestMsg = tp.TokenPool_LockOrBurn.create({
    request: tp.TokenPool_LockOrBurnInV1.create({
      transfer: {
        $: 'TokenPool_Transfer',
        id: 1n,
        details: {
          $: 'TokenPool_TransferDetails',
          receiver: FromBuffer(VALID_EVM_TOKEN_ADDRESS),
          remoteChainSelector: DEST_CHAIN_SELECTOR,
          originalSender: opts.originalSender,
          amount: 1n,
          localToken: opts.originalSender,
        },
      },
    }),
    requestedFinalityConfig: 0n,
    tokenArgs: null,
    replyTo: null,
  })

  const prepared = tp.TokenPool_LockOrBurnPrepared.create({
    feeAmount: 0n,
    destTokenAmount: 1n,
    out: tp.TokenPool_LockOrBurnOutV1.create({
      destTokenAddress: FromBuffer(opts.destTokenAddress),
      destPoolData: beginCell().storeUint(0, 256).endCell(),
    }),
  })

  return rt.Router_WithdrawRequest.create({
    accountWalletAddress: opts.accountWalletAddress,
    depositAccount: opts.depositAccount,
    amount: 1n,
    tokenPool: opts.tokenPool,
    forwardPayload: tp.TokenPool_LockOrBurnForwardPayload.create({
      originalSender: opts.originalSender,
      requestMsg,
      prepared,
    }),
  })
}

describe('OnRamp - ExecutorRequestsWithdraw address validation', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let onramp: SandboxContract<or.OnRamp>
  let mockRouter: SandboxContract<TreasuryContract>
  let mockTokenPool: SandboxContract<TreasuryContract>
  let mockAccountWallet: SandboxContract<TreasuryContract>
  let mockDepositAccount: SandboxContract<TreasuryContract>
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
    deployer = await blockchain.treasury('deployer')
    mockRouter = await blockchain.treasury('mockRouter')
    mockTokenPool = await blockchain.treasury('mockTokenPool')
    mockAccountWallet = await blockchain.treasury('mockAccountWallet')
    mockDepositAccount = await blockchain.treasury('mockDepositAccount')
    executorID = BigInt(generateRandomContractId())
    ;({ deployer, onramp } = await setup(blockchain, {
      config: {
        feeQuoter: (await blockchain.treasury('mockFeeQuoter')).address,
      },
    }))

    const result = await onramp.sendOnRampUpdateDestChainConfigs(
      deployer.getSender(),
      toNano('0.5'),
      {
        updates: [
          or.OnRampUpdateDestChainConfig.create({
            destChainSelector: DEST_CHAIN_SELECTOR,
            router: mockRouter.address,
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

    executorSender = await deployRealExecutor()
  })

  // Deploys a real executor through OnRamp_Send (like the e2e test) and returns a sender
  // bound to its address, so the OnRamp's executor-address authorization passes. Also
  // captures the executor ID embedded in the deploy message's state init.
  async function deployRealExecutor(): Promise<Sender> {
    const ccipSend = or.Router_CCIPSend.create({
      queryID: 1n,
      destChainSelector: DEST_CHAIN_SELECTOR,
      receiver: FromBuffer(VALID_EVM_TOKEN_ADDRESS),
      data: beginCell().endCell(),
      tokenAmounts: [],
      feeToken: null,
      extraArgs: or.GenericExtraArgsV2.create({
        gasLimit: 100n,
        allowOutOfOrderExecution: true,
      }),
    })
    const result = await onramp.sendOnRampSend(mockRouter.getSender(), toNano('4'), {
      msg: ccipSend,
      metadata: or.Metadata.create({
        sender: deployer.address,
        value: toNano('42'),
      }),
    })
    expect(result.transactions).toHaveTransaction({
      from: mockRouter.address,
      to: onramp.address,
      success: true,
      op: or.OnRamp_Send.PREFIX,
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

    return blockchain.sender(dest)
  }

  const sendWithdraw = async (
    destTokenAddress: Buffer,
    chainFamilySelector: bigint = ChainFamilySelectors.evm,
  ) =>
    onramp.sendOnRampExecutorRequestsWithdraw(executorSender, toNano('1'), {
      queryID: 1n,
      executorID,
      destChainSelector: DEST_CHAIN_SELECTOR,
      chainFamilySelector,
      withdrawRequest: buildWithdrawRequest({
        accountWalletAddress: mockAccountWallet.address,
        depositAccount: mockDepositAccount.address,
        tokenPool: mockTokenPool.address,
        destTokenAddress,
        originalSender: deployer.address,
      }),
    })

  it('forwards the withdrawal to the router when the dest token address is valid', async () => {
    const result = await sendWithdraw(VALID_EVM_TOKEN_ADDRESS)

    expect(result.transactions).toHaveTransaction({
      to: onramp.address,
      success: true,
      op: or.OnRamp_ExecutorRequestsWithdraw.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.Router_WithdrawToTokenPool.PREFIX,
    })
  })

  it('notifies the router for a 20-byte dest token address', async () => {
    const result = await sendWithdraw(VALID_EVM_TOKEN_ADDRESS.subarray(12))

    expect(result.transactions).toHaveTransaction({
      to: onramp.address,
      success: true,
      op: or.OnRamp_ExecutorRequestsWithdraw.PREFIX,
    })
    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.Router_WithdrawToTokenPoolFailed.PREFIX,
      body(x) {
        if (!x) return false
        const failure = rt.Router_WithdrawToTokenPoolFailed.fromSlice(x.beginParse())
        return (
          failure.queryID === 1n &&
          failure.error === BigInt(or.OnRamp.Errors['OnRamp_Error.InvalidDestTokenAddress'])
        )
      },
    })
    // No withdrawal must reach the router.
    expect(result.transactions).not.toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      op: rt.Router_WithdrawToTokenPool.PREFIX,
    })
  })

  it('notifies the router for a zero dest token address', async () => {
    const result = await sendWithdraw(Buffer.alloc(32))

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.Router_WithdrawToTokenPoolFailed.PREFIX,
    })
  })

  it('notifies the router for a dest token address in the EVM precompile space', async () => {
    const precompile = Buffer.from(
      '00000000000000000000000000000000000000000000000000000000000000ff',
      'hex',
    )
    const result = await sendWithdraw(precompile)

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.Router_WithdrawToTokenPoolFailed.PREFIX,
    })
  })

  it('notifies the router for a dest token address above uint160', async () => {
    const result = await sendWithdraw(Buffer.alloc(32, 0x01))

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.Router_WithdrawToTokenPoolFailed.PREFIX,
    })
  })

  it('notifies the router when the relayed family selector is unsupported', async () => {
    const result = await sendWithdraw(VALID_EVM_TOKEN_ADDRESS, 0x99999999n)

    expect(result.transactions).toHaveTransaction({
      from: onramp.address,
      to: mockRouter.address,
      success: true,
      op: rt.Router_WithdrawToTokenPoolFailed.PREFIX,
    })
  })
})

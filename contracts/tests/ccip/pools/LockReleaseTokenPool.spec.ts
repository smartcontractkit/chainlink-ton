import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, Cell, beginCell, toNano } from '@ton/core'
import { DepositAccount } from '../../../wrappers/gen/ccip/DepositAccount'
import { JettonMinter, JettonSender, JettonWallet } from '../../../wrappers/examples/jetton'
import * as jetton from '../../../wrappers/jetton/JettonCode'
import {
  CrossChainAddress,
  CursedSubjects,
  RateLimiter_Config,
  TokenPool,
  TokenPool_Data,
  TokenPool_AdminConfig,
  TokenPool_DynamicConfig,
  TokenPool_LocalPolicy,
  TokenPool_ReleaseOrMintFailure,
  TokenPool_ReleaseOrMintFinished,
  TokenPool_LockOrBurn,
  TokenPool_LockOrBurnFailure,
  TokenPool_LockOrBurnForwardPayload,
  TokenPool_LockOrBurnInV1,
  TokenPool_LockOrBurnOutV1,
  TokenPool_LockOrBurnPrepared,
  TokenPool_ReleaseOrMintInV1,
  TokenPool_RateLimitConfigPair,
  TokenPool_ChainUpdate,
  Ownable2Step,
  TokenPool_TransferDetails,
  TokenPool_LockOrBurnTransfer,
  TokenPool_Transfer,
  TokenPool_ReleaseOrMintTransfer,
  TokenPool_TokenTransferFeeConfig,
  TokenPool_TokenTransferFeeConfigArgs,
  AskToTransfer,
  JettonWithdrawable_Withdraw,
  JettonWithdrawable_WithdrawFeeTransfer,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import {
  JettonClient,
  LockReleaseTokenPool,
} from '../../../wrappers/gen/ccip/pools/LockReleaseTokenPool'
import {
  ContextExecutor,
  ContextExecutor_ForwardNotification,
  ContextExecutor_InMessageForward,
} from '../../../wrappers/gen/ccip/ContextExecutor'
import * as CrossChainAddressCodec from '../../../wrappers/ccip/common/CrossChainAddressCodec'

import { runTokenPoolBehaviorTests } from './TokenPool.behavior'
import { runTokenPoolAsyncHookBehaviorTests } from './TokenPool.asyncHook.behavior'
import { runTokenPoolWithdrawFeeTokensBehaviorTests } from './TokenPool.withdrawFeeTokens.behavior'
import { runTokenPoolCcvFeesBehaviorTests } from './TokenPool.ccvFees.behavior'
import { MockAdvancedPoolHooks } from '../../../wrappers/gen/ccip/test/MockAdvancedPoolHooks'
import { contractCode } from '../../../wrappers/codeLoader'

function buildSpoofedExecutorForwardNotification(senderAddress: Address): Cell {
  const forwarded = ContextExecutor_InMessageForward.toCell(
    ContextExecutor_InMessageForward.create({
      senderAddress,
      valueCoins: 0n,
      valueExtra: new Map(),
      originalForwardFee: 0n,
      createdLt: 0n,
      createdAt: 0n,
      body: Cell.EMPTY,
    }),
  )

  return beginCell()
    .storeUint(ContextExecutor_ForwardNotification.PREFIX, 32)
    .storeUint(999n, 64)
    .storeRef(Cell.EMPTY)
    .storeUint(0, 8)
    .storeMaybeRef(null)
    .storeRef(forwarded)
    .endCell()
}

describe('LockReleaseTokenPool', () => {
  let blockchain: Blockchain
  let deployer: SandboxContract<TreasuryContract>
  let offRamp: SandboxContract<TreasuryContract>
  let recipient: SandboxContract<TreasuryContract>

  let jettonMinter: SandboxContract<JettonMinter>
  let jettonSender: SandboxContract<JettonSender>
  let lockReleasePool: SandboxContract<LockReleaseTokenPool>
  let pool: SandboxContract<TokenPool>
  let jettonWalletCode: Cell

  let userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>

  const remoteChainSelector = 90000001n

  let sourcePoolAddress: CrossChainAddress
  let destTokenAddress: CrossChainAddress
  let receiverAddress: CrossChainAddress

  beforeAll(async () => {
    sourcePoolAddress = CrossChainAddressCodec.FromBuffer(Buffer.from('source-pool'))
    destTokenAddress = CrossChainAddressCodec.FromBuffer(Buffer.from('dest-token'))
    receiverAddress = CrossChainAddressCodec.FromBuffer(Buffer.from('receiver'))
  })

  beforeEach(async () => {
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    offRamp = await blockchain.treasury('offramp')
    recipient = await blockchain.treasury('recipient')

    jettonWalletCode = await jetton.JettonWalletCode()
    const jettonMinterCode = await jetton.JettonMinterCode()

    jettonMinter = blockchain.openContract(
      JettonMinter.createFromConfig(
        {
          admin: deployer.address,
          transferAdmin: null,
          walletCode: jettonWalletCode,
          jettonContent: beginCell().storeStringTail('pool-test').endCell(),
          totalSupply: 0n,
        },
        jettonMinterCode,
      ),
    )
    await jettonMinter.sendDeploy(deployer.getSender(), toNano('1'))

    const jettonSenderCode = await JettonSender.code()
    jettonSender = blockchain.openContract(
      JettonSender.createFromConfig(
        {
          jettonClient: {
            masterAddress: jettonMinter.address,
            jettonWalletCode,
          },
        },
        jettonSenderCode,
      ),
    )
    await jettonSender.sendDeploy(deployer.getSender(), toNano('1'))

    lockReleasePool = blockchain.openContract(
      LockReleaseTokenPool.fromStorage(
        {
          poolData: TokenPool_Data.create({
            adminConfig: TokenPool_AdminConfig.create({
              ownable: Ownable2Step.create({ owner: deployer.address, pendingOwner: null }),
              rmnProxy: deployer.address,
              dynamicConfig: TokenPool_DynamicConfig.create({
                router: deployer.address,
                rateLimitAdmin: null,
                feeAdmin: null,
                allowedDepositNamespaces: new Map(),
              }),
              jettonClient: JettonClient.create({
                masterAddress: jettonMinter.address,
                jettonWalletCode,
              }),
              allowedFinalityConfig: 0n,
              advancedPoolHooks: null,
            }),
            localPolicy: TokenPool_LocalPolicy.create({
              cursedSubjects: CursedSubjects.create({
                data: new Set(),
              }),
            }),
            tokenDecimals: 9n,
            remoteChainConfigs: new Map(),
            tokenTransferFeeConfigs: new Map(),
          }),
          offRampAccountCode: DepositAccount.CodeCell,
          accruedFees: 0n,
        },
        { overrideContractCode: await contractCode.ccip.local('ccip.pools.LockReleaseTokenPool') },
      ),
    )
    await lockReleasePool.sendDeploy(deployer.getSender(), toNano('2'))

    // Standard TokenPool interface
    pool = blockchain.openContract(TokenPool.fromAddress(lockReleasePool.address))

    const applyChains = await lockReleasePool.sendTokenPoolApplyChainUpdates(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 1n,
        remoteChainSelectorsToRemove: [],
        chainsToAdd: [
          TokenPool_ChainUpdate.create({
            remoteChainSelector,
            remotePoolAddresses: [sourcePoolAddress],
            remoteTokenAddress: destTokenAddress,
            rateLimitConfigs: TokenPool_RateLimitConfigPair.create({
              outbound: RateLimiter_Config.create({
                isEnabled: true,
                capacity: toNano('100'),
                rate: 1n,
              }),
              inbound: RateLimiter_Config.create({
                isEnabled: true,
                capacity: toNano('100'),
                rate: 1n,
              }),
            }),
          }),
        ],
      },
    )

    expect(applyChains.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleasePool.address,
      success: true,
    })

    const mintToOnRamp = await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: jettonSender.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('10'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })
    expect(mintToOnRamp.transactions).toHaveTransaction({
      from: deployer.address,
      to: jettonMinter.address,
      success: true,
    })

    userWallet = async (address: Address) => {
      return blockchain.openContract(
        JettonWallet.createFromAddress(await jettonMinter.getWalletAddress(address)),
      )
    }
  })

  const setupTokenPoolBehaviorContext = async () => {
    await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: lockReleasePool.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('10'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })
  }

  runTokenPoolBehaviorTests(
    'LockReleaseTokenPool',
    async () => ({
      pool,
      blockchain,
      deployer,
      offRamp,
      unauthorized: recipient,
      recipient,
      remoteChainSelector,
      onRampAddress: deployer.address,
      destTokenAddress,
      sourcePoolAddress,
      localToken: jettonMinter.address,
    }),
    {
      setup: setupTokenPoolBehaviorContext,
    },
  )

  // Async hook behavior tests (TON-TP/6)
  runTokenPoolAsyncHookBehaviorTests('LockReleaseTokenPool', async () => {
    // Deploy mock hooks
    const hooks = blockchain.openContract(
      MockAdvancedPoolHooks.fromStorage(
        { id: 0n },
        {
          overrideContractCode: await contractCode.ccip.local('ccip.test.mockAdvancedPoolHooks'),
        },
      ),
    )
    await hooks.sendDeploy(deployer.getSender(), toNano('0.1'))

    // Register hooks on pool
    const setHooksResult = await pool.sendTokenPoolSetAdvancedPoolHooks(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 9999n,
        advancedPoolHooks: hooks.address,
      },
    )
    expect(setHooksResult.transactions).toHaveTransaction({
      from: deployer.address,
      to: pool.address,
      success: true,
    })

    return {
      pool,
      blockchain,
      deployer,
      offRamp,
      unauthorized: recipient,
      recipient,
      remoteChainSelector,
      onRampAddress: deployer.address,
      destTokenAddress,
      sourcePoolAddress,
      localToken: jettonMinter.address,
      hooks,
    }
  })

  // WithdrawFeeTokens behavior tests (fee accrual + withdrawal)
  runTokenPoolWithdrawFeeTokensBehaviorTests('LockReleaseTokenPool', async () => {
    const feeAdmin = await blockchain.treasury('feeAdmin')
    const unauthorized = await blockchain.treasury('unauthorized')
    const feeBps = 100n // 1% transfer fee
    const poolWallet = await userWallet(lockReleasePool.address)

    // Enable a 1% transfer fee for the lane so locks accrue fees into the pool wallet.
    await lockReleasePool.sendTokenPoolApplyTokenTransferFeeConfigUpdates(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 3n,
        updates: [
          TokenPool_TokenTransferFeeConfigArgs.create({
            destChainSelector: remoteChainSelector,
            tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig.create({
              destGasOverhead: 1n,
              destBytesOverhead: 0n,
              finalityFeeUSDCents: 0n,
              fastFinalityFeeUSDCents: 0n,
              finalityTransferFeeBps: feeBps,
              fastFinalityTransferFeeBps: feeBps,
              isEnabled: true,
            }),
          }),
        ],
        disableChainSelectors: [],
      },
    )

    // Performs a successful fee-accruing lock of `amount` jettons.
    const doLock = async (amount: bigint, queryId: bigint) => {
      const routerWallet = await userWallet(deployer.address)

      await jettonMinter.sendMint(deployer.getSender(), {
        value: toNano('1'),
        message: {
          queryId: 0n,
          destination: deployer.address,
          tonAmount: toNano('0.05'),
          jettonAmount: toNano('50'),
          from: deployer.address,
          responseDestination: deployer.address,
          forwardTonAmount: 0n,
        },
      })

      const feeAmount = (amount * feeBps) / 10000n
      const lockOrBurn = TokenPool_LockOrBurn.create({
        queryId,
        request: TokenPool_LockOrBurnInV1.create({
          transfer: TokenPool_Transfer.create({
            id: queryId,
            details: TokenPool_TransferDetails.create({
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount,
              localToken: jettonMinter.address,
            }),
          }),
        }),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: deployer.address,
      })

      const transferPayload = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: deployer.address,
        requestMsg: lockOrBurn,
        prepared: TokenPool_LockOrBurnPrepared.create({
          feeAmount,
          destTokenAmount: amount - feeAmount,
          out: TokenPool_LockOrBurnOutV1.create({
            destTokenAddress,
            destPoolData: Cell.EMPTY,
          }),
        }),
      })

      await routerWallet.sendTransfer(deployer.getSender(), {
        value: toNano('2'),
        message: {
          queryId: Number(queryId),
          jettonAmount: amount,
          destination: lockReleasePool.address,
          responseDestination: deployer.address,
          customPayload: beginCell().storeBit(1).endCell(),
          forwardTonAmount: toNano('0.5'),
          forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(transferPayload),
        },
      })

      return { feeAmount }
    }

    return {
      pool,
      deployer,
      recipient,
      unauthorized,
      feeAdmin,
      getWithdrawableFees: () => lockReleasePool.getAccruedFees(),
      poolWallet,
      userWallet,
      feeBps,
      doLock,
    }
  })

  // CCV & fees behavior (TON-TP: getCCVs / getCCVsAndFees parity with EVM IPoolV2).
  // Enables a 1% fee config so the getCCVsAndFees post-fee math is exercised.
  runTokenPoolCcvFeesBehaviorTests(
    'LockReleaseTokenPool',
    async () => ({
      pool,
      deployer,
      offRamp,
      unauthorized: recipient,
      recipient,
      blockchain,
      remoteChainSelector,
      onRampAddress: deployer.address,
      destTokenAddress,
      sourcePoolAddress,
      localToken: jettonMinter.address,
    }),
    { withFeeConfig: true },
  )

  // The lock/release pool bounds withdrawals by its `accruedFees` ledger: an overdraw request
  // must revert (this guard is deliberate for a commingled wallet, unlike burn/mint & lockbox
  // which relay on the unbounded base path — see the shared withdraw behavior above).
  describe('withdrawFeeTokens overdraw guard', () => {
    it('reverts when the requested total exceeds the accrued-fee ledger', async () => {
      const feeBps = 100n // 1% transfer fee
      const poolWallet = await userWallet(lockReleasePool.address)

      // Enable a 1% transfer fee so a lock accrues a real fee into the ledger.
      await lockReleasePool.sendTokenPoolApplyTokenTransferFeeConfigUpdates(
        deployer.getSender(),
        toNano('0.2'),
        {
          queryId: 3n,
          updates: [
            TokenPool_TokenTransferFeeConfigArgs.create({
              destChainSelector: remoteChainSelector,
              tokenTransferFeeConfig: TokenPool_TokenTransferFeeConfig.create({
                destGasOverhead: 1n,
                destBytesOverhead: 0n,
                finalityFeeUSDCents: 0n,
                fastFinalityFeeUSDCents: 0n,
                finalityTransferFeeBps: feeBps,
                fastFinalityTransferFeeBps: feeBps,
                isEnabled: true,
              }),
            }),
          ],
          disableChainSelectors: [],
        },
      )

      // Perform one fee-accruing lock so the ledger has a positive, bounded balance.
      const routerWallet = await userWallet(deployer.address)
      const amount = toNano('10')
      const feeAmount = (amount * feeBps) / 10000n
      await jettonMinter.sendMint(deployer.getSender(), {
        value: toNano('1'),
        message: {
          queryId: 0n,
          destination: deployer.address,
          tonAmount: toNano('0.05'),
          jettonAmount: toNano('50'),
          from: deployer.address,
          responseDestination: deployer.address,
          forwardTonAmount: 0n,
        },
      })
      const lockOrBurn = TokenPool_LockOrBurn.create({
        queryId: 104n,
        request: TokenPool_LockOrBurnInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 104n,
            details: TokenPool_TransferDetails.create({
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount,
              localToken: jettonMinter.address,
            }),
          }),
        }),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: deployer.address,
      })
      const transferPayload = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: deployer.address,
        requestMsg: lockOrBurn,
        prepared: TokenPool_LockOrBurnPrepared.create({
          feeAmount,
          destTokenAmount: amount - feeAmount,
          out: TokenPool_LockOrBurnOutV1.create({
            destTokenAddress,
            destPoolData: Cell.EMPTY,
          }),
        }),
      })
      await routerWallet.sendTransfer(deployer.getSender(), {
        value: toNano('2'),
        message: {
          queryId: 104,
          jettonAmount: amount,
          destination: lockReleasePool.address,
          responseDestination: deployer.address,
          customPayload: beginCell().storeBit(1).endCell(),
          forwardTonAmount: toNano('0.5'),
          forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(transferPayload),
        },
      })
      const accrued = await lockReleasePool.getAccruedFees()
      expect(accrued).toBe(feeAmount)

      // Request more than settled fees.
      const result = await pool.sendJettonWithdrawableWithdraw(
        deployer.getSender(),
        toNano('0.5'),
        {
          queryId: 203n,
          transfers: [
            JettonWithdrawable_WithdrawFeeTransfer.create({
              wallet: poolWallet.address,
              // Enough to cover the relayed value + the pool reserve (0.2 + 0.1 <= 0.5 value sent).
              value: toNano('0.2'),
              msg: AskToTransfer.create({
                queryId: 203n,
                jettonAmount: accrued + 1n,
                transferRecipient: recipient.address,
                sendExcessesTo: pool.address,
                customPayload: null,
                forwardTonAmount: 0n,
                forwardPayload: beginCell().storeBit(0).endCell().beginParse(),
              }),
            }),
          ],
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: deployer.address,
        to: pool.address,
        success: false,
      })
    })
  })

  describe('lockOrBurn transfer input validation', () => {
    it('returns tokens and notifies the requester when forwarded amount does not match transfer amount', async () => {
      const onRampWallet = await userWallet(jettonSender.address)
      const poolWallet = await userWallet(lockReleasePool.address)
      const requestMsg = TokenPool_LockOrBurn.create({
        queryId: 44n,
        request: TokenPool_LockOrBurnInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 44n,
            details: TokenPool_TransferDetails.create({
              receiver: receiverAddress,
              remoteChainSelector,
              originalSender: deployer.address,
              amount: toNano('2'),
              localToken: jettonMinter.address,
            }),
          }),
        }),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: deployer.address,
      })
      const forwardPayload = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: deployer.address,
        requestMsg,
        prepared: TokenPool_LockOrBurnPrepared.create({
          feeAmount: 0n,
          destTokenAmount: toNano('2'),
          out: TokenPool_LockOrBurnOutV1.create({
            destTokenAddress,
            destPoolData: Cell.EMPTY,
          }),
        }),
      })

      const result = await jettonSender.sendJettonsExtended(deployer.getSender(), {
        value: toNano('2'),
        message: {
          queryId: 44n,
          amount: toNano('3'),
          destination: lockReleasePool.address,
          customPayload: beginCell().storeBit(1).endCell(),
          forwardTonAmount: toNano('0.2'),
          forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
        },
      })

      expect(result.transactions).toHaveTransaction({
        from: poolWallet.address,
        to: lockReleasePool.address,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: lockReleasePool.address,
        to: poolWallet.address,
        success: true,
        op: 0x0f8a7ea5, // AskToTransfer
      })
      expect(result.transactions).toHaveTransaction({
        from: lockReleasePool.address,
        to: deployer.address,
        // The Treasury test recipient does not implement this callback. Assert
        // the emitted message, including that it carries the residual inbound
        // value instead of consuming it in the pool.
        op: TokenPool_LockOrBurnFailure.PREFIX,
        value: (value) => value !== undefined && value > 0n,
        body(body) {
          if (!body) return false
          const failure = TokenPool_LockOrBurnFailure.fromSlice(body.beginParse())
          return failure.queryId === 44n && failure.errorCode === 14920n
        },
      })
      expect(await onRampWallet.getJettonBalance()).toEqual(toNano('10'))
      expect(await poolWallet.getJettonBalance()).toEqual(0n)
    })

    it('returns tokens without a callback when forward payload is malformed', async () => {
      const onRampWallet = await userWallet(jettonSender.address)
      const poolWallet = await userWallet(lockReleasePool.address)

      const result = await jettonSender.sendJettonsExtended(deployer.getSender(), {
        value: toNano('2'),
        message: {
          queryId: 45n,
          amount: toNano('1'),
          destination: lockReleasePool.address,
          customPayload: beginCell().storeBit(1).endCell(),
          forwardTonAmount: toNano('0.2'),
          forwardPayload: beginCell().storeUint(0, 32).endCell(),
        },
      })

      expect(result.transactions).toHaveTransaction({
        from: poolWallet.address,
        to: lockReleasePool.address,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: lockReleasePool.address,
        to: poolWallet.address,
        success: true,
        op: 0x0f8a7ea5, // AskToTransfer
      })
      expect(result.transactions).not.toHaveTransaction({
        from: lockReleasePool.address,
        to: deployer.address,
        op: TokenPool_LockOrBurnFailure.PREFIX,
      })
      expect(await onRampWallet.getJettonBalance()).toEqual(toNano('10'))
      expect(await poolWallet.getJettonBalance()).toEqual(0n)
    })
  })

  it('reverts releaseOrMint when requested amount exceeds pool liquidity', async () => {
    const result = await lockReleasePool.sendTokenPoolReleaseOrMint(
      deployer.getSender(),
      toNano('0.4'),
      {
        queryId: 46n,
        request: TokenPool_ReleaseOrMintInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 46n,
            details: TokenPool_TransferDetails.create({
              originalSender: sourcePoolAddress,
              remoteChainSelector,
              receiver: recipient.address,
              amount: toNano('999999'),
              localToken: jettonMinter.address,
            }),
          }),
          sourcePoolAddress,
          sourcePoolData: null,
          offchainTokenData: null,
        }),
        requestedFinalityConfig: 0n,
        replyTo: deployer.address,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleasePool.address,
      success: false,
    })
  })

  it('refunds inbound rate-limit capacity when a release bounces (TON-TP/5)', async () => {
    // Pool wallet is empty (no prior lock), so the release passes admission (within the
    // rate limit) but the AskToTransfer bounces. The bounce handler must return the
    // capacity it consumed at admission, leaving the bucket as it started (full).
    const releaseAmount = toNano('5') // < inbound capacity (100), so admission succeeds
    const before = await lockReleasePool.getCurrentRateLimiterState(remoteChainSelector, false)
    expect(before.inbound.tokens).toEqual(toNano('100'))

    const result = await lockReleasePool.sendTokenPoolReleaseOrMint(
      deployer.getSender(),
      toNano('0.4'),
      {
        queryId: 77n,
        request: TokenPool_ReleaseOrMintInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 77n,
            details: TokenPool_TransferDetails.create({
              originalSender: sourcePoolAddress,
              remoteChainSelector,
              receiver: recipient.address,
              amount: releaseAmount,
              localToken: jettonMinter.address,
            }),
          }),
          sourcePoolAddress,
          sourcePoolData: null,
          offchainTokenData: null,
        }),
        requestedFinalityConfig: 0n,
        replyTo: deployer.address,
      },
    )

    // The release transfer bounced back to the pool and was handled successfully.
    expect(result.transactions).toHaveTransaction({
      to: lockReleasePool.address,
      inMessageBounced: true,
      success: true,
    })

    expect(result.transactions).toHaveTransaction({
      from: lockReleasePool.address,
      to: deployer.address,
      success: true,
      op: TokenPool_ReleaseOrMintFailure.PREFIX,
      body(body) {
        if (!body) return false
        const failure = TokenPool_ReleaseOrMintFailure.fromSlice(body.beginParse())
        return failure.queryId === 77n
      },
    })

    // Consumed capacity (5) was refunded: the bucket is restored to its starting balance.
    const after = await lockReleasePool.getCurrentRateLimiterState(remoteChainSelector, false)
    expect(after.inbound.tokens).toEqual(before.inbound.tokens)
  })

  it('locks tokens through a jetton transfer notification and credits the pool wallet', async () => {
    // The deposit is initiated by the Router (deployer), not a bare JettonSender, so that
    // `msg.transferInitiator == router` and the pool's strict deposit auth accepts custody.
    const routerWallet = await userWallet(deployer.address)
    const poolWallet = await userWallet(lockReleasePool.address)

    // Mint jettons to the router (deployer) so its wallet can fund the deposit.
    await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: deployer.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('10'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })

    const lockOrBurn = TokenPool_LockOrBurn.create({
      queryId: 11n,
      request: TokenPool_LockOrBurnInV1.create({
        transfer: TokenPool_Transfer.create({
          id: 11n,
          details: TokenPool_TransferDetails.create({
            receiver: receiverAddress,
            remoteChainSelector,
            originalSender: deployer.address,
            amount: toNano('3'),
            localToken: jettonMinter.address,
          }),
        }),
      }),
      requestedFinalityConfig: 0n,
      tokenArgs: null,
      replyTo: deployer.address,
    })
    const forwardPayload = TokenPool_LockOrBurnForwardPayload.create({
      originalSender: deployer.address,
      requestMsg: lockOrBurn,
      prepared: TokenPool_LockOrBurnPrepared.create({
        feeAmount: 0n,
        destTokenAmount: toNano('3'),
        out: TokenPool_LockOrBurnOutV1.create({
          destTokenAddress,
          destPoolData: Cell.EMPTY,
        }),
      }),
    })

    const result = await routerWallet.sendTransfer(deployer.getSender(), {
      value: toNano('2'),
      message: {
        queryId: 11,
        jettonAmount: toNano('3'),
        destination: lockReleasePool.address,
        responseDestination: deployer.address,
        customPayload: beginCell().storeBit(1).endCell(),
        forwardTonAmount: toNano('0.5'),
        forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
      },
    })

    expect(result.transactions).toHaveTransaction({
      from: poolWallet.address,
      to: lockReleasePool.address,
      success: true,
    })

    expect(await poolWallet.getJettonBalance()).toEqual(toNano('3'))
  })

  it('releases tokens from pool custody after off-ramp request and finalizes through the executor notification', async () => {
    const poolWallet = await userWallet(lockReleasePool.address)
    const recipientWallet = await userWallet(recipient.address)

    await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: lockReleasePool.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('5'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })

    const result = await lockReleasePool.sendTokenPoolReleaseOrMint(
      deployer.getSender(),
      toNano('0.4'),
      {
        queryId: 22n,
        request: TokenPool_ReleaseOrMintInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 46n,
            details: TokenPool_TransferDetails.create({
              originalSender: sourcePoolAddress,
              remoteChainSelector,
              receiver: recipient.address,
              amount: toNano('2'),
              localToken: jettonMinter.address,
            }),
          }),
          sourcePoolAddress,
          sourcePoolData: null,
          offchainTokenData: null,
        }),
        requestedFinalityConfig: 0n,
        replyTo: deployer.address,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleasePool.address,
      success: true,
    })

    // Tokens land in the account's jetton wallet (not recipient's personal wallet)
    const oaa = DepositAccount.fromStorage({
      owner: lockReleasePool.address, // pool deploys+inits the account
      proxy: lockReleasePool.address,
      beneficiaries: new Set([recipient.address]),
    })
    const oaaWallet = await userWallet(oaa.address)
    expect(await oaaWallet.getJettonBalance()).toEqual(toNano('2'))
    expect(await poolWallet.getJettonBalance()).toEqual(toNano('3'))

    expect(result.transactions).toHaveTransaction({
      from: lockReleasePool.address,
      to: deployer.address,
      success: true,
      op: TokenPool_ReleaseOrMintFinished.PREFIX,
      body(body) {
        if (!body) return false
        const response = TokenPool_ReleaseOrMintFinished.fromSlice(body.beginParse())
        return response.queryId === 22n && response.out.destinationAmount === toNano('2')
      },
    })
  })

  it('releases tokens with null replyTo without emitting a response message', async () => {
    const poolWallet = await userWallet(lockReleasePool.address)
    // Account wallet for checking balance (not recipient's personal wallet)
    const oaa = DepositAccount.fromStorage({
      owner: lockReleasePool.address, // pool deploys+inits the account
      proxy: lockReleasePool.address,
      beneficiaries: new Set([recipient.address]),
    })
    const oaaWallet = await userWallet(oaa.address)

    await jettonMinter.sendMint(deployer.getSender(), {
      value: toNano('1'),
      message: {
        queryId: 0n,
        destination: lockReleasePool.address,
        tonAmount: toNano('0.05'),
        jettonAmount: toNano('4'),
        from: deployer.address,
        responseDestination: deployer.address,
        forwardTonAmount: 0n,
      },
    })

    const result = await lockReleasePool.sendTokenPoolReleaseOrMint(
      deployer.getSender(),
      toNano('0.4'),
      {
        queryId: 223n,
        request: TokenPool_ReleaseOrMintInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 223n,
            details: TokenPool_TransferDetails.create({
              originalSender: sourcePoolAddress,
              remoteChainSelector,
              receiver: recipient.address,
              amount: toNano('1'),
              localToken: jettonMinter.address,
            }),
          }),
          sourcePoolAddress,
          sourcePoolData: null,
          offchainTokenData: null,
        }),
        requestedFinalityConfig: 0n,
        replyTo: null,
      },
    )

    expect(await oaaWallet.getJettonBalance()).toEqual(toNano('1'))
    expect(await poolWallet.getJettonBalance()).toEqual(toNano('3'))

    const releaseResponses = result.transactions.filter((tx: any) => {
      const body = tx.inMessage?.body
      if (!body) {
        return false
      }

      const slice = body.beginParse()
      if (slice.remainingBits < 32) {
        return false
      }

      return (
        tx.inMessage?.info?.src?.equals?.(lockReleasePool.address) &&
        slice.preloadUint(32) === TokenPool_ReleaseOrMintFinished.PREFIX
      )
    })
    expect(releaseResponses.length).toBe(0)
  })

  it('rejects forged executor forward notifications', async () => {
    const forged = await recipient.send({
      to: lockReleasePool.address,
      value: toNano('0.1'),
      bounce: false,
      body: buildSpoofedExecutorForwardNotification(recipient.address),
    })

    expect(forged.transactions).toHaveTransaction({
      from: recipient.address,
      to: lockReleasePool.address,
      success: false,
    })
  })

  it('applies local cursed state and blocks release while cursed', async () => {
    const curseUpdate = await lockReleasePool.sendTokenPoolSetCursedSubjects(
      deployer.getSender(),
      toNano('0.2'),
      {
        queryId: 901n,
        cursedSubjects: CursedSubjects.create({ data: new Set([remoteChainSelector]) }),
      },
    )

    expect(curseUpdate.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleasePool.address,
      success: true,
    })

    expect(await lockReleasePool.getVerifyNotCursed(remoteChainSelector)).toBe(false)

    const result = await lockReleasePool.sendTokenPoolReleaseOrMint(
      deployer.getSender(),
      toNano('0.3'),
      {
        queryId: 33n,
        request: TokenPool_ReleaseOrMintInV1.create({
          transfer: TokenPool_Transfer.create({
            id: 33n,
            details: TokenPool_TransferDetails.create({
              originalSender: sourcePoolAddress,
              remoteChainSelector,
              receiver: recipient.address,
              amount: toNano('1'),
              localToken: jettonMinter.address,
            }),
          }),
          sourcePoolAddress,
          sourcePoolData: null,
          offchainTokenData: null,
        }),
        requestedFinalityConfig: 0n,
        replyTo: deployer.address,
      },
    )

    expect(result.transactions).toHaveTransaction({
      from: deployer.address,
      to: lockReleasePool.address,
      success: false,
    })
  })
})

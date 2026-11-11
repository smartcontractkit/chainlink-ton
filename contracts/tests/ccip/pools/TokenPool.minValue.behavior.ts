import '@ton/test-utils'
import { toNano } from '@ton/core'

import {
  TokenPool,
  TokenPool_LockOrBurnInV1,
  TokenPool_Transfer,
  TokenPool_TransferDetails,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { TokenPoolBehaviorContext, deliveryTo, releaseRequest } from './TokenPool.behavior'
import { CCIPNamespace } from '../../../wrappers/ccip/NameSpace'

const MIN_RENT = toNano('0.05')
const MIN_RUNTIME_RENT = toNano('0.01')
const INSUFFICIENT_MESSAGE_VALUE = TokenPool.Errors['TokenPool_Error.InsufficientMessageValue']

function lockOrBurnRequest(ctx: TokenPoolBehaviorContext): TokenPool_LockOrBurnInV1 {
  return TokenPool_LockOrBurnInV1.create({
    transfer: TokenPool_Transfer.create({
      details: TokenPool_TransferDetails.create({
        receiver: ctx.destTokenAddress,
        remoteChainSelector: ctx.remoteChainSelector,
        originalSender: ctx.deployer.address,
        amount: 1n,
        localToken: ctx.localToken,
      }),
    }),
  })
}

async function setPoolBalance(ctx: TokenPoolBehaviorContext, balance: bigint, due = 0n) {
  const poolAccount = await ctx.blockchain.getContract(ctx.pool.address)
  poolAccount.balance = balance
  if (due > 0n) {
    const account = poolAccount.account
    account.account!.storageStats.duePayment = due
    poolAccount.account = account
  }
}

/// Shared min-value behavior tests. Every assertion is about protecting the pool balance,
/// admission budget, or rate-limit state when a value boundary is crossed.
export function runTokenPoolMinValueBehaviorTests(
  name: string,
  setup: () => Promise<TokenPoolBehaviorContext>,
) {
  describe(`${name} min-value behavior`, () => {
    it('keeps the rent target when an admin message funds the top-up', async () => {
      const ctx = await setup()
      const poolAccount = await ctx.blockchain.getContract(ctx.pool.address)
      poolAccount.balance = toNano('0.01')

      const result = await ctx.pool.sendTokenPoolSetDynamicConfig(
        ctx.deployer.getSender(),
        toNano('0.1'),
        {
          queryId: 970n,
          router: ctx.deployer.address,
          rateLimitAdmin: null,
          feeAdmin: null,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect((await ctx.blockchain.getContract(ctx.pool.address)).balance).toBeGreaterThanOrEqual(
        MIN_RENT,
      )
      expect((await ctx.pool.getDynamicConfig()).router.equals(ctx.deployer.address)).toBe(true)
    })

    it('rolls back an admin message that cannot fund the rent target', async () => {
      const ctx = await setup()
      const configBefore = await ctx.pool.getDynamicConfig()
      const poolAccount = await ctx.blockchain.getContract(ctx.pool.address)
      poolAccount.balance = toNano('0.01')

      await ctx.pool.sendTokenPoolSetDynamicConfig(ctx.deployer.getSender(), toNano('0.03'), {
        queryId: 971n,
        router: ctx.deployer.address,
        rateLimitAdmin: null,
        feeAdmin: null,
      })

      expect((await ctx.pool.getDynamicConfig()).router.equals(configBefore.router)).toBe(true)
      expect((await ctx.blockchain.getContract(ctx.pool.address)).balance).toEqual(toNano('0.01'))
    })

    it('restores the runtime rent target on lock/burn at admission', async () => {
      const ctx = await setup()
      await setPoolBalance(ctx, toNano('0.005'))

      const finalizationValue = toNano('0.01')
      const admission = (await ctx.pool.getBudget()).lockOrBurn.admission
      const result = await ctx.pool.sendTokenPoolLockOrBurn(
        ctx.deployer.getSender(),
        admission + finalizationValue,
        {
          queryId: 973n,
          request: lockOrBurnRequest(ctx),
          requestedFinalityConfig: 0n,
          tokenArgs: null,
          replyTo: ctx.deployer.address,
          finalizationValue,
          onRampNamespaces: new Set([BigInt(CCIPNamespace.SenderAccount)]),
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect((await ctx.blockchain.getContract(ctx.pool.address)).balance).toBeGreaterThanOrEqual(
        MIN_RUNTIME_RENT,
      )
    })

    it('restores the runtime rent target on release at admission', async () => {
      const ctx = await setup()
      await setPoolBalance(ctx, toNano('0.005'))

      const delivery = deliveryTo(ctx.recipient.address, ctx.deployer.address)
      const admission = (await ctx.pool.getBudget()).releaseOrMint.admission
      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        admission + delivery.forwardTonAmount,
        {
          queryId: 974n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          delivery,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect((await ctx.blockchain.getContract(ctx.pool.address)).balance).toBeGreaterThanOrEqual(
        MIN_RUNTIME_RENT,
      )
    })

    it('covers storage due at the runtime rent boundary on lock/burn', async () => {
      const ctx = await setup()
      await setPoolBalance(ctx, MIN_RUNTIME_RENT, MIN_RUNTIME_RENT)

      const finalizationValue = toNano('0.01')
      const admission = (await ctx.pool.getBudget()).lockOrBurn.admission
      const result = await ctx.pool.sendTokenPoolLockOrBurn(
        ctx.deployer.getSender(),
        admission + finalizationValue,
        {
          queryId: 975n,
          request: lockOrBurnRequest(ctx),
          requestedFinalityConfig: 0n,
          tokenArgs: null,
          replyTo: ctx.deployer.address,
          finalizationValue,
          onRampNamespaces: new Set([BigInt(CCIPNamespace.SenderAccount)]),
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect((await ctx.blockchain.getContract(ctx.pool.address)).balance).toBeGreaterThanOrEqual(
        MIN_RUNTIME_RENT,
      )
    })

    it('covers storage due at the runtime rent boundary on release', async () => {
      const ctx = await setup()
      await setPoolBalance(ctx, MIN_RUNTIME_RENT, MIN_RUNTIME_RENT)

      const delivery = deliveryTo(ctx.recipient.address, ctx.deployer.address)
      const admission = (await ctx.pool.getBudget()).releaseOrMint.admission
      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        admission + delivery.forwardTonAmount,
        {
          queryId: 976n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          delivery,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect((await ctx.blockchain.getContract(ctx.pool.address)).balance).toBeGreaterThanOrEqual(
        MIN_RUNTIME_RENT,
      )
    })

    it('rejects lock/burn when storage due exceeds the runtime rent buffer', async () => {
      const ctx = await setup()
      const before = await ctx.pool.getCurrentRateLimiterState(ctx.remoteChainSelector, false)
      const poolAccount = await ctx.blockchain.getContract(ctx.pool.address)
      poolAccount.balance = toNano('0.005')
      const account = poolAccount.account
      account.account!.storageStats.duePayment = toNano('0.01')
      poolAccount.account = account

      const finalizationValue = toNano('0.01')
      const admission = (await ctx.pool.getBudget()).lockOrBurn.admission
      const result = await ctx.pool.sendTokenPoolLockOrBurn(
        ctx.deployer.getSender(),
        admission + finalizationValue,
        {
          queryId: 977n,
          request: lockOrBurnRequest(ctx),
          requestedFinalityConfig: 0n,
          tokenArgs: null,
          replyTo: ctx.deployer.address,
          finalizationValue,
          onRampNamespaces: new Set([BigInt(CCIPNamespace.SenderAccount)]),
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        exitCode: INSUFFICIENT_MESSAGE_VALUE,
      })
      const after = await ctx.pool.getCurrentRateLimiterState(ctx.remoteChainSelector, false)
      expect(after.inbound.tokens).toEqual(before.inbound.tokens)
      expect(after.outbound.tokens).toEqual(before.outbound.tokens)
    })

    it('rejects release when storage due exceeds the runtime rent buffer', async () => {
      const ctx = await setup()
      const before = await ctx.pool.getCurrentRateLimiterState(ctx.remoteChainSelector, false)
      const poolAccount = await ctx.blockchain.getContract(ctx.pool.address)
      poolAccount.balance = toNano('0.005')
      const account = poolAccount.account
      account.account!.storageStats.duePayment = toNano('0.01')
      poolAccount.account = account

      const delivery = deliveryTo(ctx.recipient.address, ctx.deployer.address)
      const admission = (await ctx.pool.getBudget()).releaseOrMint.admission
      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        admission + delivery.forwardTonAmount,
        {
          queryId: 978n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          delivery,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        exitCode: INSUFFICIENT_MESSAGE_VALUE,
      })
      const after = await ctx.pool.getCurrentRateLimiterState(ctx.remoteChainSelector, false)
      expect(after.inbound.tokens).toEqual(before.inbound.tokens)
      expect(after.outbound.tokens).toEqual(before.outbound.tokens)
    })

    it('does not consume inbound rate limit below the release admission boundary', async () => {
      const ctx = await setup()
      const before = await ctx.pool.getCurrentRateLimiterState(ctx.remoteChainSelector, false)
      const admission = (await ctx.pool.getBudget()).releaseOrMint.admission
      const delivery = deliveryTo(ctx.recipient.address, ctx.deployer.address)
      const value = admission + delivery.forwardTonAmount - 1n

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(ctx.deployer.getSender(), value, {
        queryId: 972n,
        request: releaseRequest(ctx),
        requestedFinalityConfig: 0n,
        replyTo: ctx.deployer.address,
        delivery,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
      })
      const after = await ctx.pool.getCurrentRateLimiterState(ctx.remoteChainSelector, false)
      expect(after.inbound.tokens).toEqual(before.inbound.tokens)
      expect(after.outbound.tokens).toEqual(before.outbound.tokens)
    })
  })
}

import '@ton/test-utils'
import { toNano } from '@ton/core'

import { TokenPoolBehaviorContext, deliveryTo, releaseRequest } from './TokenPool.behavior'

const MIN_RENT = toNano('0.05')

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

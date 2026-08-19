import '@ton/test-utils'
import { SandboxContract } from '@ton/sandbox'
import { beginCell, toNano } from '@ton/core'
import {
  TokenPool,
  TokenPool_CCVs,
  TokenPool_CCVsAndFees,
  TokenPool_GetCCVs,
  TokenPool_TokenTransferFeeConfig,
  TokenPool_TokenTransferFeeConfigArgs,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { MockAdvancedPoolHooks } from '../../../wrappers/gen/ccip/test/MockAdvancedPoolHooks'
import { TokenPoolBehaviorContext } from './TokenPool.behavior'

// CCV & Fees behavior tests (TON-TP: getCCVs / getCCVsAndFees parity with EVM IPoolV2).
// ———————————————————————————————————————————————————————————————————————————————
// Covers the TON-native async req/res replacement for EVM `getRequiredCCVs` + `getFee`:
//   - TokenPool_GetCCVs        → TokenPool_CCVs         (CCVs only ; OffRamp)
//   - TokenPool_GetCCVsAndFees → TokenPool_CCVsAndFees  (CCVs + fee context ; OnRamp)
// When async hooks are configured both flows forward a `TokenPool_GetCCVs` to the hooks,
// the pool reassembles the correct reply from the echoed context on the callback, and a
// hooks bounce finalizes with `TokenPool_GetCCVsFailed`.

export type TokenPoolCcvFeesBehaviorContext = TokenPoolBehaviorContext & {
  hooks?: SandboxContract<MockAdvancedPoolHooks>
}

export type TokenPoolCcvFeesBehaviorOptions = {
  // Set to register the (mock) async hooks before each test.
  withHooks?: boolean
  // Pre-enable a token transfer fee config for the lane (destChainSelector=remoteChainSelector).
  withFeeConfig?: boolean
}

function enabledFeeConfig(tokenFeeBps: bigint): TokenPool_TokenTransferFeeConfig {
  return TokenPool_TokenTransferFeeConfig.create({
    destGasOverhead: 1n,
    destBytesOverhead: 0n,
    finalityFeeUSDCents: 0n,
    fastFinalityFeeUSDCents: 0n,
    finalityTransferFeeBps: tokenFeeBps,
    fastFinalityTransferFeeBps: tokenFeeBps,
    isEnabled: true,
  })
}

const FEE_BPS = 100n // 1% transfer fee
const BPS_DIVIDER = 10_000n

export function runTokenPoolCcvFeesBehaviorTests(
  name: string,
  setup: () => Promise<TokenPoolCcvFeesBehaviorContext>,
  options: TokenPoolCcvFeesBehaviorOptions = {},
) {
  describe(`${name} CCV & fees behavior`, () => {
    let ctx: TokenPoolCcvFeesBehaviorContext

    beforeEach(async () => {
      ctx = await setup()
      if (ctx.hooks) {
        await ctx.pool.sendTokenPoolSetAdvancedPoolHooks(ctx.deployer.getSender(), toNano('0.2'), {
          queryId: 6001n,
          advancedPoolHooks: ctx.hooks.address,
        })
      }
      if (options.withFeeConfig) {
        await ctx.pool.sendTokenPoolApplyTokenTransferFeeConfigUpdates(ctx.deployer.getSender(), toNano('0.2'), {
          queryId: 12345n,
          updates: [
            TokenPool_TokenTransferFeeConfigArgs.create({
              destChainSelector: ctx.remoteChainSelector,
              tokenTransferFeeConfig: enabledFeeConfig(FEE_BPS),
            }),
          ],
          disableChainSelectors: [],
        })
      }
    })

    // ======= TokenPool_GetCCVs (CCVs only) =======

    it('GetCCVs (no fee) replies TokenPool_CCVs to the sender with empty CCVs + echoed fwdPayload', async () => {
      const fwd = beginCell().storeUint(0xbeef, 16).endCell()

      const result = await ctx.pool.sendTokenPoolGetCCVs(ctx.deployer.getSender(), toNano('0.3'), {
        queryId: 10n,
        localToken: ctx.localToken,
        remoteChainSelector: ctx.remoteChainSelector,
        amount: toNano('1'),
        requestedFinalityConfig: 0n,
        direction: 0n, // Outbound
        extraData: null,
        replyTo: ctx.deployer.address,
        forwardPayload: fwd,
      })

      // Reply goes to msg.sender (not replyTo-owned semantics), immediately when no hooks.
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        success: true,
        op: TokenPool_CCVs.PREFIX,
        body(body) {
          if (!body) return false
          const reply = TokenPool_CCVs.fromSlice(body.beginParse())
          return (
            reply.queryId === 10n &&
            reply.requiredCCVs.length === 0 && // empty == use lane defaults
            reply.fwdPayload !== null &&
            reply.fwdPayload!.hash().equals(fwd.hash())
          )
        },
      })
    })

    it('GetCCVs reverts for an unsupported token', async () => {
      const result = await ctx.pool.sendTokenPoolGetCCVs(ctx.deployer.getSender(), toNano('0.3'), {
        queryId: 12n,
        localToken: ctx.deployer.address, // not the pool's local token
        remoteChainSelector: ctx.remoteChainSelector,
        amount: toNano('1'),
        requestedFinalityConfig: 0n,
        direction: 0n,
        extraData: null,
        replyTo: ctx.deployer.address,
        forwardPayload: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('GetCCVs reverts for an un-configured chain', async () => {
      const result = await ctx.pool.sendTokenPoolGetCCVs(ctx.deployer.getSender(), toNano('0.3'), {
        queryId: 13n,
        localToken: ctx.localToken,
        remoteChainSelector: 99999999n, // not configured
        amount: toNano('1'),
        requestedFinalityConfig: 0n,
        direction: 0n,
        extraData: null,
        replyTo: ctx.deployer.address,
        forwardPayload: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('GetCCVs reverts for a disallowed finality config', async () => {
      const result = await ctx.pool.sendTokenPoolGetCCVs(ctx.deployer.getSender(), toNano('0.3'), {
        queryId: 14n,
        localToken: ctx.localToken,
        remoteChainSelector: ctx.remoteChainSelector,
        amount: toNano('1'),
        requestedFinalityConfig: 123n, // non-zero, not the allowed finality (0)
        direction: 0n,
        extraData: null,
        replyTo: ctx.deployer.address,
        forwardPayload: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    // ======= TokenPool_GetCCVsAndFees (CCVs + fee) =======

    it('GetCCVsAndFees (enabled 1% fee) replies TokenPool_CCVsAndFees with post-fee amount + fee config', async () => {
      const fwd = beginCell().storeUint(0xcafe, 16).endCell()
      const amount = toNano('10')
      // Outbound post-fee amount = amount - (amount * bps) / BPS_DIVIDER
      const postFee = amount - (amount * FEE_BPS) / BPS_DIVIDER

      const result = await ctx.pool.sendTokenPoolGetCCVsAndFees(ctx.deployer.getSender(), toNano('0.3'), {
        queryId: 11n,
        localToken: ctx.localToken,
        remoteChainSelector: ctx.remoteChainSelector,
        amount,
        requestedFinalityConfig: 0n,
        direction: 0n, // Outbound
        extraData: null,
        forwardPayload: fwd,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        success: true,
        op: TokenPool_CCVsAndFees.PREFIX,
        body(body) {
          if (!body) return false
          const reply = TokenPool_CCVsAndFees.fromSlice(body.beginParse())
          return (
            reply.queryId === 11n &&
            reply.fees.feesProvided === true &&
            reply.fees.amountPostFee === postFee &&
            reply.fees.feeConfig.finalityTransferFeeBps === FEE_BPS &&
            reply.fwdPayload !== null &&
            reply.fwdPayload!.hash().equals(fwd.hash())
          )
        },
      })
    })

    it('GetCCVsAndFees (no fee config) replies TokenPool_CCVsAndFees with feesProvided=false + unchanged amount', async () => {
      // Remove the lane's fee config (idempotent even if never set). Mirrors EVM `getFee`
      // returning isEnabled=false so callers fall back to FeeQuoter defaults.
      await ctx.pool.sendTokenPoolApplyTokenTransferFeeConfigUpdates(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 12346n,
        updates: [],
        disableChainSelectors: [ctx.remoteChainSelector],
      })

      const amount = toNano('10')
      const result = await ctx.pool.sendTokenPoolGetCCVsAndFees(ctx.deployer.getSender(), toNano('0.3'), {
        queryId: 15n,
        localToken: ctx.localToken,
        remoteChainSelector: ctx.remoteChainSelector,
        amount,
        requestedFinalityConfig: 0n,
        direction: 0n, // Outbound
        extraData: null,
        forwardPayload: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        success: true,
        op: TokenPool_CCVsAndFees.PREFIX,
        body(body) {
          if (!body) return false
          const reply = TokenPool_CCVsAndFees.fromSlice(body.beginParse())
          return (
            reply.queryId === 15n &&
            reply.fees.feesProvided === false &&
            reply.fees.amountPostFee === amount && // no bps fee deducted when disabled
            reply.fees.feeConfig.isEnabled === false
          )
        },
      })
    })

    // ======= Async hooks configured =======

    it('GetCCVs with async hooks forwards to hooks and replies TokenPool_CCVs from the hook CCV set', async () => {
      if (!ctx.hooks) return // only meaningful when the harness registers hooks

      const fwd = beginCell().storeUint(0xabcd, 16).endCell()
      const result = await ctx.pool.sendTokenPoolGetCCVs(ctx.deployer.getSender(), toNano('0.3'), {
        queryId: 20n,
        localToken: ctx.localToken,
        remoteChainSelector: ctx.remoteChainSelector,
        amount: toNano('1'),
        requestedFinalityConfig: 0n,
        direction: 0n,
        extraData: null,
        replyTo: ctx.deployer.address,
        forwardPayload: fwd,
      })

      // Pool forwards GetCCVs to the mock hooks.
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.hooks!.address,
        success: true,
        op: TokenPool_GetCCVs.PREFIX,
      })

      // Hook replies QueryCCVsReply (empty) -> pool replies TokenPool_CCVs to the sender.
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        success: true,
        op: TokenPool_CCVs.PREFIX,
        body(body) {
          if (!body) return false
          const reply = TokenPool_CCVs.fromSlice(body.beginParse())
          return reply.queryId === 20n && reply.requiredCCVs.length === 0
        },
      })
    })
  })
}

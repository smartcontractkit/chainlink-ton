import '@ton/test-utils'
import { Blockchain, SandboxContract, internal } from '@ton/sandbox'
import { Address, beginCell, Cell, toNano } from '@ton/core'
import {
  TokenPool,
  TokenPool_CCVs,
  TokenPool_CCVsAndFees,
  TokenPool_GetCCVs,
  TokenPool_GetCCVsFailed,
  TokenPool_QueryCCVsReply,
  TokenPool_TokenTransferFeeConfig,
  TokenPool_TokenTransferFeeConfigArgs,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { MockAdvancedPoolHooks } from '../../../wrappers/gen/ccip/test/MockAdvancedPoolHooks'
import { contractCode } from '../../../wrappers/codeLoader'
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
  // Sandbox blockchain handle, used to drive raw messages (e.g. a QueryCCVsReply sent from
  // the hooks address directly).
  blockchain: Blockchain
  // Deploys a mock-hooks contract with the given storage `id` and registers it on the pool.
  // The mock's id drives the CCV behavior it echoes back:
  //   0   → empty CCV set (lane defaults)
  //   !=0 → a single hard-coded CCV (the pool address)
  //   255 → bounces the forwarded GetCCVs, finalizing via TokenPool_GetCCVsFailed
  // Optional — when omitted a shared default impl (deploy-by-id + SetAdvancedPoolHooks) is used.
  deployHooks?: (id: number) => Promise<SandboxContract<MockAdvancedPoolHooks>>
}

// Behavior ids understood by MockAdvancedPoolHooks.
export const MOCK_HOOKS_DEFAULT_ID = 0n // empty CCVs = lane defaults
export const MOCK_HOOKS_NONEMPTY_ID = 1n // single CCV
export const MOCK_HOOKS_BOUNCE_ID = 255n // bounce → GetCCVsFailed

// Default hook deployment: identical across all pools — deploy a mock-hooks contract with the
// given storage `id` and register it on the pool. Specs can override `ctx.deployHooks` if they
// ever need different behavior.
function createSharedDeployHooks(ctx: TokenPoolCcvFeesBehaviorContext) {
  return async (id: number): Promise<SandboxContract<MockAdvancedPoolHooks>> => {
    const hooks = ctx.blockchain.openContract(
      MockAdvancedPoolHooks.fromStorage(
        { id: BigInt(id) },
        {
          overrideContractCode: await contractCode.ccip.local('ccip.test.mockAdvancedPoolHooks'),
        },
      ),
    )
    await hooks.sendDeploy(ctx.deployer.getSender(), toNano('0.1'))
    await ctx.pool.sendTokenPoolSetAdvancedPoolHooks(ctx.deployer.getSender(), toNano('0.2'), {
      queryId: BigInt(6000 + id),
      advancedPoolHooks: hooks.address,
    })
    return hooks
  }
}

export type TokenPoolCcvFeesBehaviorOptions = {
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
    // Always installed in `beforeEach` (shared default unless a spec overrides it).
    let deployHooks: (id: number) => Promise<SandboxContract<MockAdvancedPoolHooks>>

    beforeEach(async () => {
      ctx = await setup()
      // Install the shared default `deployHooks` unless a spec supplied its own.
      ctx.deployHooks = ctx.deployHooks ?? createSharedDeployHooks(ctx)
      deployHooks = ctx.deployHooks
      if (options.withFeeConfig) {
        await ctx.pool.sendTokenPoolApplyTokenTransferFeeConfigUpdates(
          ctx.deployer.getSender(),
          toNano('0.2'),
          {
            queryId: 12345n,
            updates: [
              TokenPool_TokenTransferFeeConfigArgs.create({
                destChainSelector: ctx.remoteChainSelector,
                tokenTransferFeeConfig: enabledFeeConfig(FEE_BPS),
              }),
            ],
            disableChainSelectors: [],
          },
        )
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

      const result = await ctx.pool.sendTokenPoolGetCCVsAndFees(
        ctx.deployer.getSender(),
        toNano('0.3'),
        {
          queryId: 11n,
          localToken: ctx.localToken,
          remoteChainSelector: ctx.remoteChainSelector,
          amount,
          requestedFinalityConfig: 0n,
          direction: 0n, // Outbound
          extraData: null,
          forwardPayload: fwd,
        },
      )

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
      await ctx.pool.sendTokenPoolApplyTokenTransferFeeConfigUpdates(
        ctx.deployer.getSender(),
        toNano('0.2'),
        {
          queryId: 12346n,
          updates: [],
          disableChainSelectors: [ctx.remoteChainSelector],
        },
      )

      const amount = toNano('10')
      const result = await ctx.pool.sendTokenPoolGetCCVsAndFees(
        ctx.deployer.getSender(),
        toNano('0.3'),
        {
          queryId: 15n,
          localToken: ctx.localToken,
          remoteChainSelector: ctx.remoteChainSelector,
          amount,
          requestedFinalityConfig: 0n,
          direction: 0n, // Outbound
          extraData: null,
          forwardPayload: null,
        },
      )

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

    it('GetCCVs with async hooks (empty CCV set) forwards to hooks and replies lane-default CCVs', async () => {
      const hooks = await deployHooks(Number(MOCK_HOOKS_DEFAULT_ID))

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
        to: hooks.address,
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

    it('GetCCVs with async hooks echoes a NON-empty CCV set back to the requester', async () => {
      const hooks = await deployHooks(Number(MOCK_HOOKS_NONEMPTY_ID))
      // The mock returns a single hard-coded CCV = the pool address (the hook's replyTo).
      const expectedCCV: Address = ctx.pool.address

      const result = await ctx.pool.sendTokenPoolGetCCVs(ctx.deployer.getSender(), toNano('0.3'), {
        queryId: 21n,
        localToken: ctx.localToken,
        remoteChainSelector: ctx.remoteChainSelector,
        amount: toNano('1'),
        requestedFinalityConfig: 0n,
        direction: 0n,
        extraData: null,
        replyTo: ctx.deployer.address,
        forwardPayload: null,
      })

      // The non-empty list passes through pool → hooks → pool → requester unchanged.
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: hooks.address,
        success: true,
        op: TokenPool_GetCCVs.PREFIX,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        success: true,
        op: TokenPool_CCVs.PREFIX,
        body(body) {
          if (!body) return false
          const reply = TokenPool_CCVs.fromSlice(body.beginParse())
          return (
            reply.queryId === 21n &&
            reply.requiredCCVs.length === 1 &&
            reply.requiredCCVs[0].equals(expectedCCV)
          )
        },
      })
    })

    it('GetCCVsToHooks bounce finalizes with TokenPool_GetCCVsFailed to the requester, echoing fwdPayload', async () => {
      const hooks = await deployHooks(Number(MOCK_HOOKS_BOUNCE_ID))

      const fwd = beginCell().storeUint(0x1234, 16).endCell()
      const result = await ctx.pool.sendTokenPoolGetCCVs(ctx.deployer.getSender(), toNano('0.5'), {
        queryId: 22n,
        localToken: ctx.localToken,
        remoteChainSelector: ctx.remoteChainSelector,
        amount: toNano('1'),
        requestedFinalityConfig: 0n,
        direction: 0n,
        extraData: null,
        replyTo: ctx.deployer.address,
        forwardPayload: fwd,
      })

      // Pool forwards GetCCVs to the bouncing mock hooks (the hooks transaction reverts, so we
      // only assert the send occurred, not that the hooks succeeded).
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: hooks.address,
        op: TokenPool_GetCCVs.PREFIX,
      })

      // The hooks throw → the pool receives a bounce → finalizes with GetCCVsFailed to the
      // original requester, echoing their fwdPayload so they can resume/abort.
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        success: true,
        op: TokenPool_GetCCVsFailed.PREFIX,
        body(body) {
          if (!body) return false
          const reply = TokenPool_GetCCVsFailed.fromSlice(body.beginParse())
          return (
            reply.queryId === 22n &&
            reply.errorCode !== 0n &&
            reply.fwdPayload !== null &&
            reply.fwdPayload!.hash().equals(fwd.hash())
          )
        },
      })
    })

    // ======= onQueryCCVsReply access control (pool side) =======

    it('rejects onQueryCCVsReply from a non-hook sender', async () => {
      await deployHooks(Number(MOCK_HOOKS_DEFAULT_ID))

      // An unauthorized sender sends a QueryCCVsReply to the pool — must revert (sender != hooks).
      const result = await ctx.blockchain.sendMessage(
        internal({
          from: ctx.unauthorized.address,
          to: ctx.pool.address,
          value: toNano('0.3'),
          body: TokenPool_QueryCCVsReply.toCell(
            TokenPool_QueryCCVsReply.create({
              queryId: 23n,
              requiredCCVs: [ctx.pool.address],
              replyPayload: Cell.EMPTY,
            }),
          ),
        }),
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects onQueryCCVsReply from hooks with a missing replyPayload', async () => {
      const hooks = await deployHooks(Number(MOCK_HOOKS_DEFAULT_ID))

      // Sender is the registered hooks (passes auth) but the forwarded context is missing.
      const result = await ctx.blockchain.sendMessage(
        internal({
          from: hooks.address,
          to: ctx.pool.address,
          value: toNano('0.3'),
          body: TokenPool_QueryCCVsReply.toCell(
            TokenPool_QueryCCVsReply.create({
              queryId: 24n,
              requiredCCVs: [],
              replyPayload: null,
            }),
          ),
        }),
      )

      expect(result.transactions).toHaveTransaction({
        from: hooks.address,
        to: ctx.pool.address,
        success: false,
      })
    })
  })
}

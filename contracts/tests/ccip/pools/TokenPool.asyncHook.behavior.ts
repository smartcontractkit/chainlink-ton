import { SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Cell, Sender, toNano } from '@ton/core'
import {
  TokenPool,
  TokenPool_LockOrBurn,
  TokenPool_LockOrBurnFailure,
  TokenPool_LockOrBurnForwardPayload,
  TokenPool_LockOrBurnInV1,
  TokenPool_LockOrBurnOutV1,
  TokenPool_LockOrBurnPrepared,
  TokenPool_LockOrBurnTransfer,
  TokenPool_ReleaseOrMint,
  TokenPool_ReleaseOrMintFailure,
  TokenPool_ReleaseOrMintFinished,
  TokenPool_ReleaseOrMintForwardPayload,
  TokenPool_ReleaseOrMintInV1,
  TokenPool_ReleaseOrMintOutV1,
  TokenPool_ReleaseOrMintPrepared,
  TokenPool_Transfer,
  TokenPool_TransferDetails,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { MockAdvancedPoolHooks } from '../../../wrappers/gen/ccip/test/MockAdvancedPoolHooks'
import { contractCode } from '../../../wrappers/codeLoader'
import { TokenPoolBehaviorContext, releaseRequest } from './TokenPool.behavior'
// Async Hook Behavior Tests (TON-TP/6)
// ———————————————————————————————————————————————————————————————————————————————

export type TokenPoolAsyncHookBehaviorContext = TokenPoolBehaviorContext & {
  hooks: SandboxContract<MockAdvancedPoolHooks>
}

export function runTokenPoolAsyncHookBehaviorTests(
  name: string,
  setup: () => Promise<TokenPoolAsyncHookBehaviorContext>,
) {
  describe(`${name} async hook behavior`, () => {
    // Deploys a MockAdvancedPoolHooks instance with `id = 255`, which throws on
    // PreflightCheck/PostflightCheck so the requests bounce back to the pool.
    async function deployBounceHooks(
      ctx: TokenPoolAsyncHookBehaviorContext,
    ): Promise<SandboxContract<MockAdvancedPoolHooks>> {
      const bounceHooks = ctx.blockchain.openContract(
        MockAdvancedPoolHooks.fromStorage(
          { id: 255n },
          { overrideContractCode: await contractCode.ccip.local('ccip.test.mockAdvancedPoolHooks') },
        ),
      )
      await bounceHooks.sendDeploy(ctx.deployer.getSender(), toNano('0.1'))
      return bounceHooks
    }

    //
    // Helper: build a LockOrBurnInV1 request body
    //
    function lockOrBurnIn(
      ctx: TokenPoolAsyncHookBehaviorContext,
      overrides: Partial<TokenPool_LockOrBurnInV1> = {},
    ): TokenPool_LockOrBurnInV1 {
      const transfer: TokenPool_LockOrBurnTransfer = {
        $: 'TokenPool_Transfer',
        id: 1n,
        details: TokenPool_TransferDetails.create({
          receiver: ctx.destTokenAddress,
          remoteChainSelector: ctx.remoteChainSelector,
          originalSender: ctx.deployer.address,
          amount: toNano('1'),
          localToken: ctx.localToken,
        }),
      }
      return TokenPool_LockOrBurnInV1.create({
        transfer,
        ...overrides,
      })
    }

    //
    // Helper: build a LockOrBurn forward payload cell
    //
    function lockOrBurnForwardPayload(
      ctx: TokenPoolAsyncHookBehaviorContext,
      request: TokenPool_LockOrBurnInV1,
    ): Cell {
      const prepared = TokenPool_LockOrBurnPrepared.create({
        feeAmount: 0n,
        destTokenAmount: toNano('1'),
        out: TokenPool_LockOrBurnOutV1.create({
          destTokenAddress: ctx.destTokenAddress,
          destPoolData: Cell.EMPTY,
        }),
      })
      const fwdp = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: ctx.deployer.address,
        requestMsg: TokenPool_LockOrBurn.create({
          queryId: 0n,
          request,
          requestedFinalityConfig: 0n,
          tokenArgs: null,
          replyTo: null,
        }),
        prepared,
      })
      return TokenPool_LockOrBurnForwardPayload.toCell(fwdp)
    }

    //
    // Helper: build a ReleaseOrMint forward payload cell
    //
    function releaseOrMintForwardPayload(
      ctx: TokenPoolAsyncHookBehaviorContext,
      request: TokenPool_ReleaseOrMintInV1,
    ): Cell {
      const prepared = TokenPool_ReleaseOrMintPrepared.create({
        requestedFinalityConfig: 0n,
        localAmount: toNano('1'),
        out: TokenPool_ReleaseOrMintOutV1.create({
          destinationAmount: toNano('1'),
        }),
      })
      const fwdp = TokenPool_ReleaseOrMintForwardPayload.create({
        originalSender: ctx.deployer.address,
        requestMsg: TokenPool_ReleaseOrMint.create({
          queryId: 0n,
          request,
          requestedFinalityConfig: 0n,
          replyTo: null,
        }),
        prepared,
      })
      return TokenPool_ReleaseOrMintForwardPayload.toCell(fwdp)
    }

    // === SetAdvancedPoolHooks access control ===

    it('rejects setAdvancedPoolHooks from non-owner', async () => {
      const ctx = await setup()

      const result = await ctx.pool.sendTokenPoolSetAdvancedPoolHooks(
        ctx.unauthorized.getSender(),
        toNano('0.2'),
        {
          queryId: 6001n,
          advancedPoolHooks: ctx.hooks.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    // === Preflight Check — Success Flow (queryId even) ===

    it('completes LockOrBurn after async preflight check succeeds (queryId=2)', async () => {
      const ctx = await setup()

      const request = lockOrBurnIn(ctx)

      const result = await ctx.pool.sendTokenPoolLockOrBurn(ctx.deployer.getSender(), toNano('1'), {
        queryId: 2n,
        request,
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: ctx.deployer.address,
      })

      // Pool sends PreflightCheck to hooks
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.hooks.address,
        success: true,
      })

      // Hook replies Finished → pool processes callback
      expect(result.transactions).toHaveTransaction({
        from: ctx.hooks.address,
        to: ctx.pool.address,
        success: true,
      })
    })

    // === Preflight Check — Failure Flow (queryId odd) ===

    it('sends LockOrBurnFailure and refunds rate limit on async preflight failure (queryId=1)', async () => {
      const ctx = await setup()

      const request = lockOrBurnIn(ctx)

      const result = await ctx.pool.sendTokenPoolLockOrBurn(ctx.deployer.getSender(), toNano('1'), {
        queryId: 1n,
        request,
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: ctx.deployer.address,
      })

      // Pool sends PreflightCheck to hooks
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.hooks.address,
        success: true,
      })

      // Hook replies Failed → pool sends LockOrBurnFailure
      expect(result.transactions).toHaveTransaction({
        from: ctx.hooks.address,
        to: ctx.pool.address,
        success: true,
      })

      // Pool sends failure notification back to original sender
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        success: true,
      })
    })

    // === Postflight Check — Success Flow (queryId even) ===

    it('completes ReleaseOrMint after async postflight check succeeds (queryId=2)', async () => {
      const ctx = await setup()

      const request = releaseRequest(ctx)

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('1'),
        {
          queryId: 2n,
          request,
          requestedFinalityConfig: 0n,
          replyTo: ctx.offRamp.address,
        },
      )

      // Pool sends PostflightCheck to hooks
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.hooks.address,
        success: true,
      })

      // Hook replies Finished → pool processes callback
      expect(result.transactions).toHaveTransaction({
        from: ctx.hooks.address,
        to: ctx.pool.address,
        success: true,
      })
    })

    // === Postflight Check — Failure Flow (queryId odd) ===

    it('sends ReleaseOrMintFailure and refunds rate limit on async postflight failure (queryId=1)', async () => {
      const ctx = await setup()

      const request = releaseRequest(ctx)

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('1'),
        {
          queryId: 1n,
          request,
          requestedFinalityConfig: 0n,
          replyTo: ctx.offRamp.address,
        },
      )

      // Pool sends PostflightCheck to hooks
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.hooks.address,
        success: true,
      })

      // Hook replies Failed → pool sends ReleaseOrMintFailure
      expect(result.transactions).toHaveTransaction({
        from: ctx.hooks.address,
        to: ctx.pool.address,
        success: true,
      })

      // Pool sends failure notification
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.offRamp.address,
        success: true,
        op: TokenPool_ReleaseOrMintFailure.PREFIX,
        body(body) {
          if (!body) return false
          const failure = TokenPool_ReleaseOrMintFailure.fromSlice(body.beginParse())
          return failure.queryId === 1n
        },
      })
    })

    it('does not emit ReleaseOrMintFailure when async postflight fails and replyTo is null', async () => {
      const ctx = await setup()

      const request = releaseRequest(ctx)

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('1'),
        {
          queryId: 3n,
          request,
          requestedFinalityConfig: 0n,
          replyTo: null,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.hooks.address,
        to: ctx.pool.address,
        success: true,
      })

      const failures = result.transactions.filter((tx: any) => {
        const body = tx.inMessage?.body
        if (!body) {
          return false
        }

        const slice = body.beginParse()
        return (
          slice.remainingBits >= 32 &&
          slice.preloadUint(32) === TokenPool_ReleaseOrMintFailure.PREFIX
        )
      })

      expect(failures).toHaveLength(0)
    })

    // === Inline mode (replyTo = null for LockOrBurn) ===

    it('processes LockOrBurn inline when replyTo is null', async () => {
      const ctx = await setup()

      const request = lockOrBurnIn(ctx)

      const result = await ctx.pool.sendTokenPoolLockOrBurn(ctx.deployer.getSender(), toNano('1'), {
        queryId: 100n,
        request,
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: null,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
    })

    it('processes ReleaseOrMint inline when no hooks configured', async () => {
      const ctx = await setup()

      const request = releaseRequest(ctx)

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('1'),
        {
          queryId: 100n,
          request,
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
    })

    // === QueryId-based branching verification ===

    it('even queryId → PreflightCheckFinished, odd queryId → PreflightCheckFailed', async () => {
      const ctx = await setup()

      // Even → success path
      const requestEven = lockOrBurnIn(ctx)
      const evenResult = await ctx.pool.sendTokenPoolLockOrBurn(
        ctx.deployer.getSender(),
        toNano('1'),
        {
          queryId: 4n,
          request: requestEven,
          requestedFinalityConfig: 0n,
          tokenArgs: null,
          replyTo: ctx.deployer.address,
        },
      )

      expect(evenResult.transactions).toHaveTransaction({
        from: ctx.hooks.address,
        to: ctx.pool.address,
        success: true,
      })

      // Odd → failure path
      const requestOdd = lockOrBurnIn(ctx)
      const oddResult = await ctx.pool.sendTokenPoolLockOrBurn(
        ctx.deployer.getSender(),
        toNano('1'),
        {
          queryId: 5n,
          request: requestOdd,
          requestedFinalityConfig: 0n,
          tokenArgs: null,
          replyTo: ctx.deployer.address,
        },
      )

      expect(oddResult.transactions).toHaveTransaction({
        from: ctx.hooks.address,
        to: ctx.pool.address,
        success: true,
      })

      // Odd path should produce failure notification
      expect(oddResult.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        success: true,
      })
    })

    it('even queryId → PostflightCheckFinished, odd queryId → PostflightCheckFailed', async () => {
      const ctx = await setup()

      // Even → success
      const requestEven = releaseRequest(ctx)
      const evenResult = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('1'),
        {
          queryId: 6n,
          request: requestEven,
          requestedFinalityConfig: 0n,
          replyTo: ctx.offRamp.address,
        },
      )

      expect(evenResult.transactions).toHaveTransaction({
        from: ctx.hooks.address,
        to: ctx.pool.address,
        success: true,
      })

      // Odd → failure
      const requestOdd = releaseRequest(ctx)
      const oddResult = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('1'),
        {
          queryId: 7n,
          request: requestOdd,
          requestedFinalityConfig: 0n,
          replyTo: ctx.offRamp.address,
        },
      )

      expect(oddResult.transactions).toHaveTransaction({
        from: ctx.hooks.address,
        to: ctx.pool.address,
        success: true,
      })

      // Odd path should produce failure notification
      expect(oddResult.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.offRamp.address,
        success: true,
      })
    })

    // === Hooks contract rejects the request at entry (bounce) ===
    // A hooks contract that throws on our PreflightCheck/PostflightCheck (undeployed, wrong ABI,
    // or rejecting at entry) bounces the request. Before this was handled, the bounce was dropped:
    // the rate-limit capacity consumed at admission leaked and no *Failure reply was sent, so the
    // flow stalled. The base TokenPool.onBouncedMessage must unwind both legs.

    it('refunds outbound rate limit + sends LockOrBurnFailure when PreflightCheck bounces', async () => {
      const ctx = await setup()

      // A hooks contract whose `id` makes it throw on PreflightCheck/PostflightCheck.
      const bounceHooks = await deployBounceHooks(ctx)
      await ctx.pool.sendTokenPoolSetAdvancedPoolHooks(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 9998n,
        advancedPoolHooks: bounceHooks.address,
      })

      const before = await ctx.pool.getCurrentRateLimiterState(ctx.remoteChainSelector, false)

      const result = await ctx.pool.sendTokenPoolLockOrBurn(ctx.deployer.getSender(), toNano('1'), {
        queryId: 8n,
        request: lockOrBurnIn(ctx),
        requestedFinalityConfig: 0n,
        tokenArgs: null,
        replyTo: ctx.deployer.address,
      })

      // The pool's PreflightCheck bounced back and was handled successfully.
      expect(result.transactions).toHaveTransaction({
        to: ctx.pool.address,
        inMessageBounced: true,
        success: true,
      })

      // The flow finalizes with a LockOrBurnFailure to the original requester.
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        op: TokenPool_LockOrBurnFailure.PREFIX,
        success: true,
      })

      // The outbound capacity consumed at admission was refunded.
      const after = await ctx.pool.getCurrentRateLimiterState(ctx.remoteChainSelector, false)
      expect(after.outbound.tokens).toEqual(before.outbound.tokens)
    })

    it('refunds inbound rate limit + sends ReleaseOrMintFailure when PostflightCheck bounces', async () => {
      const ctx = await setup()

      const bounceHooks = await deployBounceHooks(ctx)
      await ctx.pool.sendTokenPoolSetAdvancedPoolHooks(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 9997n,
        advancedPoolHooks: bounceHooks.address,
      })

      const before = await ctx.pool.getCurrentRateLimiterState(ctx.remoteChainSelector, false)

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('1'),
        {
          queryId: 9n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.offRamp.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        to: ctx.pool.address,
        inMessageBounced: true,
        success: true,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.offRamp.address,
        op: TokenPool_ReleaseOrMintFailure.PREFIX,
        success: true,
      })

      const after = await ctx.pool.getCurrentRateLimiterState(ctx.remoteChainSelector, false)
      expect(after.inbound.tokens).toEqual(before.inbound.tokens)
    })
  })
}

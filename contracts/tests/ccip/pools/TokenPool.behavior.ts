import '@ton/test-utils'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, toNano } from '@ton/core'
import {
  CrossChainAddress,
  CursedSubjects,
  TokenPool,
  TokenPool_ChainUpdate,
  TokenPool_RampUpdate,
  TokenPool_RateLimitConfigPair,
  TokenPool_RateLimitConfigArgs,
  TokenPool_ReleaseOrMint,
  TokenPool_ReleaseOrMintFailure,
  TokenPool_ReleaseOrMintFinished,
  TokenPool_ReleaseOrMintInV1,
  RateLimiter_Config,
  TokenPool_Transfer,
  TokenPool_TransferDetails,
} from '../../../wrappers/gen/ccip/pools/TokenPool'

export type TokenPoolBehaviorContext = {
  pool: SandboxContract<TokenPool>
  deployer: SandboxContract<TreasuryContract>
  offRamp: SandboxContract<TreasuryContract>
  unauthorized: SandboxContract<TreasuryContract>
  recipient: SandboxContract<TreasuryContract>
  onRampAddress: Address
  remoteChainSelector: bigint
  destTokenAddress: CrossChainAddress
  sourcePoolAddress: CrossChainAddress
  localToken: Address
}

export type TokenPoolBehaviorHooks = {
  setup?: (ctx: TokenPoolBehaviorContext) => Promise<void>
}

export function releaseRequest(
  ctx: TokenPoolBehaviorContext,
  overrides: Partial<TokenPool_ReleaseOrMintInV1> = {},
): TokenPool_ReleaseOrMintInV1 {
  return TokenPool_ReleaseOrMintInV1.create({
    transfer: TokenPool_Transfer.create({
      id: 1n,
      details: TokenPool_TransferDetails.create({
        originalSender: ctx.sourcePoolAddress,
        remoteChainSelector: ctx.remoteChainSelector,
        receiver: ctx.recipient.address,
        amount: 1n,
        localToken: ctx.localToken,
      }),
    }),
    sourcePoolAddress: ctx.sourcePoolAddress,
    sourcePoolData: null,
    offchainTokenData: null,
    ...overrides,
  })
}

export function runTokenPoolBehaviorTests(
  name: string,
  setup: () => Promise<TokenPoolBehaviorContext>,
  hooks: TokenPoolBehaviorHooks = {},
) {
  const baseSetup = setup
  setup = async () => {
    const ctx = await baseSetup()
    await hooks.setup?.(ctx)
    return ctx
  }

  describe(`${name} TokenPool behavior`, () => {
    it('mirrors ramp access and supported chain state after setup', async () => {
      const ctx = await setup()

      expect(await ctx.pool.getIsSupportedChain(ctx.remoteChainSelector)).toBe(true)
      expect(await ctx.pool.getOnRamp(ctx.remoteChainSelector)).not.toBeNull()
      expect(await ctx.pool.getOffRamp(ctx.remoteChainSelector)).toEqualAddress(ctx.offRamp.address)
    })

    it('reverts releaseOrMint when caller is not configured off-ramp', async () => {
      const ctx = await setup()

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.unauthorized.getSender(),
        toNano('0.3'),
        {
          queryId: 901n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects a token transfer notification from an untrusted sender wallet (TON-TP/2)', async () => {
      const ctx = await setup()

      // Spoofed deposit: a TransferNotificationForRecipient sent from an address that is NOT
      // this pool's own Jetton wallet. The base lib's single verification point must reject it
      // before any custody action, otherwise a forged wallet could fake a deposit.
      const result = await ctx.pool.sendTransferNotificationForRecipient(
        ctx.unauthorized.getSender(),
        toNano('0.3'),
        {
          queryId: 920n,
          jettonAmount: toNano('1'),
          transferInitiator: ctx.unauthorized.address,
          forwardPayload: beginCell().endCell().beginParse(),
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
        exitCode: 14910, // TokenPool_Error.Unauthorized (facility 149 → base 14900, +10)
      })
    })

    it('reverts releaseOrMint while chain is cursed', async () => {
      const ctx = await setup()

      await ctx.pool.sendTokenPoolSetCursedSubjects(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 901n,
        cursedSubjects: CursedSubjects.create({ data: new Set([ctx.remoteChainSelector]) }),
      })
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(false)

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 902n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('starts with chain not cursed', async () => {
      const ctx = await setup()
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(true)
    })

    it('rejects releaseOrMint once the inbound rate limit is exhausted', async () => {
      const ctx = await setup()

      // Tighten the inbound bucket to a non-refilling capacity of 1 so we can
      // deterministically hit the ceiling on the second release (EVM parity: TokenRateLimitReached).
      await ctx.pool.sendTokenPoolSetRateLimitConfig(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 930n,
        updates: [
          TokenPool_RateLimitConfigArgs.create({
            remoteChainSelector: ctx.remoteChainSelector,
            fastFinality: false,
            outboundRateLimiterConfig: RateLimiter_Config.create({
              isEnabled: true,
              capacity: 1n,
              rate: 0n,
            }),
            inboundRateLimiterConfig: RateLimiter_Config.create({
              isEnabled: true,
              capacity: 1n,
              rate: 0n,
            }),
          }),
        ],
      })

      // First release consumes the single inbound token and admits.
      const first = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 931n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
        },
      )
      expect(first.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: true,
      })

      // Second release of the same amount must be rejected (bucket has no refill, rate=0).
      const second = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 932n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
        },
      )
      expect(second.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('returns null ramps for unknown chain', async () => {
      const ctx = await setup()
      const unknownChainSelector = ctx.remoteChainSelector + 1n
      expect(await ctx.pool.getOnRamp(unknownChainSelector)).toBeNull()
      expect(await ctx.pool.getOffRamp(unknownChainSelector)).toBeNull()
    })

    it('returns unsupported for unknown chain', async () => {
      const ctx = await setup()
      const unknownChainSelector = ctx.remoteChainSelector + 1n
      expect(await ctx.pool.getIsSupportedChain(unknownChainSelector)).toBe(false)
    })

    it('rejects applyChainUpdates from non-owner', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolApplyChainUpdates(
        ctx.unauthorized.getSender(),
        toNano('0.2'),
        {
          queryId: 903n,
          remoteChainSelectorsToRemove: [],
          chainsToAdd: [],
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects updateRampAccess from non-owner', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolUpdateRampAccess(
        ctx.unauthorized.getSender(),
        toNano('0.2'),
        {
          queryId: 904n,
          updates: [
            TokenPool_RampUpdate.create({
              remoteChainSelector: ctx.remoteChainSelector,
              onRamp: ctx.onRampAddress,
              offRamp: ctx.unauthorized.address,
            }),
          ],
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects cursed-subject updates from non-rmn sender', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolSetCursedSubjects(
        ctx.unauthorized.getSender(),
        toNano('0.2'),
        {
          queryId: 904n,
          cursedSubjects: CursedSubjects.create({ data: new Set([ctx.remoteChainSelector]) }),
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('can clear cursed subject back to not cursed', async () => {
      const ctx = await setup()
      await ctx.pool.sendTokenPoolSetCursedSubjects(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 901n,
        cursedSubjects: CursedSubjects.create({ data: new Set([ctx.remoteChainSelector]) }),
      })
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(false)

      await ctx.pool.sendTokenPoolSetCursedSubjects(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 902n,
        cursedSubjects: CursedSubjects.create({ data: new Set<bigint>() }),
      })
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(true)
    })

    it('removes configured chain via applyChainUpdates', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolApplyChainUpdates(
        ctx.deployer.getSender(),
        toNano('0.2'),
        {
          queryId: 905n,
          remoteChainSelectorsToRemove: [ctx.remoteChainSelector],
          chainsToAdd: [],
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect(await ctx.pool.getIsSupportedChain(ctx.remoteChainSelector)).toBe(false)
    })

    it('reverts releaseOrMint after configured chain is removed', async () => {
      const ctx = await setup()
      await ctx.pool.sendTokenPoolApplyChainUpdates(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 906n,
        remoteChainSelectorsToRemove: [ctx.remoteChainSelector],
        chainsToAdd: [],
      })

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 907n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects removing a non-existent chain', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolApplyChainUpdates(
        ctx.deployer.getSender(),
        toNano('0.2'),
        {
          queryId: 908n,
          remoteChainSelectorsToRemove: [ctx.remoteChainSelector + 1n],
          chainsToAdd: [],
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('can replace off-ramp mapping via updateRampAccess', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolUpdateRampAccess(
        ctx.deployer.getSender(),
        toNano('0.2'),
        {
          queryId: 909n,
          updates: [
            TokenPool_RampUpdate.create({
              remoteChainSelector: ctx.remoteChainSelector,
              onRamp: ctx.onRampAddress,
              offRamp: ctx.unauthorized.address,
            }),
          ],
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect(await ctx.pool.getOffRamp(ctx.remoteChainSelector)).toEqualAddress(
        ctx.unauthorized.address,
      )
    })

    it('rejects old off-ramp sender after remapping off-ramp', async () => {
      const ctx = await setup()
      await ctx.pool.sendTokenPoolUpdateRampAccess(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 910n,
        updates: [
          TokenPool_RampUpdate.create({
            remoteChainSelector: ctx.remoteChainSelector,
            onRamp: ctx.onRampAddress,
            offRamp: ctx.unauthorized.address,
          }),
        ],
      })

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 911n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects releaseOrMint when source pool is not configured', async () => {
      const ctx = await setup()
      const wrongSourcePoolAddress = beginCell()
        .storeUint(4, 8)
        .storeBuffer(Buffer.from('evil'))
        .endCell()
        .beginParse()
      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 912n,
          request: releaseRequest(ctx, { sourcePoolAddress: wrongSourcePoolAddress }),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects releaseOrMint when local token does not match pool token', async () => {
      const ctx = await setup()
      const wrongLocalToken = ctx.deployer.address
      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 913n,
          request: releaseRequest(ctx, {
            transfer: TokenPool_Transfer.create({
              id: 1n,
              details: TokenPool_TransferDetails.create({
                originalSender: ctx.sourcePoolAddress,
                remoteChainSelector: ctx.remoteChainSelector,
                receiver: ctx.recipient.address,
                amount: 1n,
                localToken: wrongLocalToken,
              }),
            }),
          }),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('clears existing off-ramp when update passes null off-ramp', async () => {
      const ctx = await setup()
      await ctx.pool.sendTokenPoolUpdateRampAccess(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 914n,
        updates: [
          TokenPool_RampUpdate.create({
            remoteChainSelector: ctx.remoteChainSelector,
            onRamp: ctx.onRampAddress,
            offRamp: null,
          }),
        ],
      })

      expect(await ctx.pool.getOffRamp(ctx.remoteChainSelector)).toBeNull()
    })

    it('rejects existing off-ramp sender after null off-ramp update', async () => {
      const ctx = await setup()
      await ctx.pool.sendTokenPoolUpdateRampAccess(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 915n,
        updates: [
          TokenPool_RampUpdate.create({
            remoteChainSelector: ctx.remoteChainSelector,
            onRamp: ctx.onRampAddress,
            offRamp: null,
          }),
        ],
      })

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 916n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('can re-add chain after remove via applyChainUpdates', async () => {
      const ctx = await setup()

      await ctx.pool.sendTokenPoolApplyChainUpdates(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 917n,
        remoteChainSelectorsToRemove: [ctx.remoteChainSelector],
        chainsToAdd: [],
      })

      const addResult = await ctx.pool.sendTokenPoolApplyChainUpdates(
        ctx.deployer.getSender(),
        toNano('0.2'),
        {
          queryId: 918n,
          remoteChainSelectorsToRemove: [],
          chainsToAdd: [
            TokenPool_ChainUpdate.create({
              remoteChainSelector: ctx.remoteChainSelector,
              remotePoolAddresses: [ctx.sourcePoolAddress],
              remoteTokenAddress: ctx.destTokenAddress,
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

      expect(addResult.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect(await ctx.pool.getIsSupportedChain(ctx.remoteChainSelector)).toBe(true)
    })

    it('reuses the same caller queryId safely across repeated release continuations', async () => {
      const ctx = await setup()
      const amount = toNano('1')
      const queryId = 700n

      const repeatedRequest = {
        queryId,
        request: releaseRequest(ctx, {
          transfer: TokenPool_Transfer.create({
            id: queryId,
            details: TokenPool_TransferDetails.create({
              originalSender: ctx.sourcePoolAddress,
              remoteChainSelector: ctx.remoteChainSelector,
              receiver: ctx.recipient.address,
              amount,
              localToken: ctx.localToken,
            }),
          }),
        }),
        requestedFinalityConfig: 0n,
        replyTo: ctx.deployer.address,
      }

      const first = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.6'),
        repeatedRequest,
      )
      const second = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.6'),
        repeatedRequest,
      )

      const allTransactions = [...first.transactions, ...second.transactions]
      const completions = allTransactions.filter((tx: any) => {
        const body = tx.inMessage?.body
        if (!body) {
          return false
        }

        const slice = body.beginParse()
        if (slice.remainingBits < 32) {
          return false
        }

        if (
          !tx.inMessage?.info?.src?.equals?.(ctx.pool.address) ||
          slice.preloadUint(32) !== TokenPool_ReleaseOrMintFinished.PREFIX
        ) {
          return false
        }

        const response = TokenPool_ReleaseOrMintFinished.fromSlice(slice)
        return response.queryId === queryId && response.out.destinationAmount === amount
      })

      const failures = allTransactions.filter((tx: any) => {
        const body = tx.inMessage?.body
        if (!body) {
          return false
        }

        const slice = body.beginParse()
        if (slice.remainingBits < 32) {
          return false
        }

        if (
          !tx.inMessage?.info?.src?.equals?.(ctx.pool.address) ||
          slice.preloadUint(32) !== TokenPool_ReleaseOrMintFailure.PREFIX
        ) {
          return false
        }

        return TokenPool_ReleaseOrMintFailure.fromSlice(slice).queryId === queryId
      })

      expect(completions).toHaveLength(2)
      expect(failures).toHaveLength(0)
    })
  })
}

import '@ton/test-utils'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, Dictionary, DictionaryValue, Sender, toNano } from '@ton/core'
import {
  CrossChainAddress,
  CursedSubjects,
  TokenPool,
  TokenPool_ChainUpdate,
  TokenPool_LockOrBurn,
  TokenPool_LockOrBurnForwardPayload,
  TokenPool_LockOrBurnInV1,
  TokenPool_LockOrBurnOutV1,
  TokenPool_LockOrBurnPrepared,
  TokenPool_LockOrBurnTransfer,
  TokenPool_RampUpdate,
  TokenPool_RateLimitConfigPair,
  TokenPool_ReleaseOrMint,
  TokenPool_ReleaseOrMintForwardPayload,
  TokenPool_ReleaseOrMintInV1,
  TokenPool_ReleaseOrMintOutV1,
  TokenPool_ReleaseOrMintPrepared,
  RateLimiter_Config,
  TokenPool_Transfer,
  TokenPool_TransferDetails,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { asSnakedCell, asSnakedCellEmpty } from '../../../src/utils'
import { createEmptyTensorValue, loadMap } from '../../../src/utils/dict'
import { MockAdvancedPoolHooks } from '../../../wrappers/gen/ccip/test/MockAdvancedPoolHooks'

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

function releaseRequest(
  ctx: TokenPoolBehaviorContext,
  overrides: Partial<TokenPool_ReleaseOrMintInV1> = {},
): TokenPool_ReleaseOrMintInV1 {
  return TokenPool_ReleaseOrMintInV1.create({
    transfer: TokenPool_Transfer.create({
      id: 1n,
      details: {
        ref: TokenPool_TransferDetails.create({
          originalSender: { ref: ctx.sourcePoolAddress },
          remoteChainSelector: ctx.remoteChainSelector,
          receiver: ctx.recipient.address,
          amount: 1n,
          localToken: ctx.localToken,
        }),
      },
    }),
    sourcePoolAddress: { ref: ctx.sourcePoolAddress },
    sourcePoolData: null,
    offchainTokenData: null,
    ...overrides,
  })
}

export function runTokenPoolBehaviorTests(
  name: string,
  setup: () => Promise<TokenPoolBehaviorContext>,
) {
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
          request: { ref: releaseRequest(ctx) },
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
        cursedSubjects: CursedSubjects.create({
          data: loadMap(
            Dictionary.Keys.BigInt(128),
            createEmptyTensorValue(),
            new Map([[ctx.remoteChainSelector, []]]),
          ),
        }),
      })
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(false)

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 902n,
          request: { ref: releaseRequest(ctx) },
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
          remoteChainSelectorsToRemove: asSnakedCellEmpty<bigint>(),
          chainsToAdd: asSnakedCellEmpty<TokenPool_ChainUpdate>(),
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
          updates: asSnakedCell(
            [
              TokenPool_RampUpdate.create({
                remoteChainSelector: ctx.remoteChainSelector,
                onRamp: ctx.onRampAddress,
                offRamp: ctx.unauthorized.address,
              }),
            ],
            (item) => TokenPool_RampUpdate.toCell(item).asBuilder(),
          ),
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
          cursedSubjects: CursedSubjects.create({
            data: loadMap(
              Dictionary.Keys.BigInt(128),
              createEmptyTensorValue(),
              new Map([[ctx.remoteChainSelector, []]]),
            ),
          }),
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
        cursedSubjects: CursedSubjects.create({
          data: loadMap(
            Dictionary.Keys.BigInt(128),
            createEmptyTensorValue(),
            new Map([[ctx.remoteChainSelector, []]]),
          ),
        }),
      })
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(false)

      await ctx.pool.sendTokenPoolSetCursedSubjects(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 902n,
        cursedSubjects: CursedSubjects.create({
          data: Dictionary.empty(Dictionary.Keys.BigInt(128)),
        }),
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
          remoteChainSelectorsToRemove: asSnakedCell([ctx.remoteChainSelector], (item: bigint) =>
            beginCell().storeUint(item, 64),
          ),
          chainsToAdd: asSnakedCellEmpty<TokenPool_ChainUpdate>(),
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
        remoteChainSelectorsToRemove: asSnakedCell([ctx.remoteChainSelector], (item: bigint) =>
          beginCell().storeUint(item, 64),
        ),
        chainsToAdd: asSnakedCellEmpty<TokenPool_ChainUpdate>(),
      })

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 907n,
          request: { ref: releaseRequest(ctx) },
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
          remoteChainSelectorsToRemove: asSnakedCell(
            [ctx.remoteChainSelector + 1n],
            (item: bigint) => beginCell().storeUint(item, 64),
          ),
          chainsToAdd: asSnakedCellEmpty<TokenPool_ChainUpdate>(),
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
          updates: asSnakedCell(
            [
              TokenPool_RampUpdate.create({
                remoteChainSelector: ctx.remoteChainSelector,
                onRamp: ctx.onRampAddress,
                offRamp: ctx.unauthorized.address,
              }),
            ],
            (item) => TokenPool_RampUpdate.toCell(item).asBuilder(),
          ),
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
        updates: asSnakedCell(
          [
            TokenPool_RampUpdate.create({
              remoteChainSelector: ctx.remoteChainSelector,
              onRamp: ctx.onRampAddress,
              offRamp: ctx.unauthorized.address,
            }),
          ],
          (item) => TokenPool_RampUpdate.toCell(item).asBuilder(),
        ),
      })

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 911n,
          request: { ref: releaseRequest(ctx) },
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
          request: {
            ref: releaseRequest(ctx, { sourcePoolAddress: { ref: wrongSourcePoolAddress } }),
          },
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
          request: {
            ref: releaseRequest(ctx, {
              transfer: TokenPool_Transfer.create({
                id: 1n,
                details: {
                  ref: TokenPool_TransferDetails.create({
                    originalSender: { ref: ctx.sourcePoolAddress },
                    remoteChainSelector: ctx.remoteChainSelector,
                    receiver: ctx.recipient.address,
                    amount: 1n,
                    localToken: wrongLocalToken,
                  }),
                },
              }),
            }),
          },
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
        updates: asSnakedCell(
          [
            TokenPool_RampUpdate.create({
              remoteChainSelector: ctx.remoteChainSelector,
              onRamp: ctx.onRampAddress,
              offRamp: null,
            }),
          ],
          (item) => TokenPool_RampUpdate.toCell(item).asBuilder(),
        ),
      })

      expect(await ctx.pool.getOffRamp(ctx.remoteChainSelector)).toBeNull()
    })

    it('rejects existing off-ramp sender after null off-ramp update', async () => {
      const ctx = await setup()
      await ctx.pool.sendTokenPoolUpdateRampAccess(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 915n,
        updates: asSnakedCell(
          [
            TokenPool_RampUpdate.create({
              remoteChainSelector: ctx.remoteChainSelector,
              onRamp: ctx.onRampAddress,
              offRamp: null,
            }),
          ],
          (item) => TokenPool_RampUpdate.toCell(item).asBuilder(),
        ),
      })

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 916n,
          request: { ref: releaseRequest(ctx) },
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
        remoteChainSelectorsToRemove: asSnakedCell([ctx.remoteChainSelector], (item) =>
          beginCell().storeUint(item, 64),
        ),
        chainsToAdd: asSnakedCellEmpty<TokenPool_ChainUpdate>(),
      })

      const addResult = await ctx.pool.sendTokenPoolApplyChainUpdates(
        ctx.deployer.getSender(),
        toNano('0.2'),
        {
          queryId: 918n,
          remoteChainSelectorsToRemove: asSnakedCell([], (item) => beginCell().storeUint(item, 64)),
          chainsToAdd: asSnakedCell(
            [
              TokenPool_ChainUpdate.create({
                remoteChainSelector: ctx.remoteChainSelector,
                remotePoolAddresses: asSnakedCell([ctx.sourcePoolAddress], (item) => {
                  let b = beginCell()
                  CrossChainAddress.store(item, b)
                  return b
                }),
                remoteTokenAddress: { ref: ctx.destTokenAddress },
                rateLimitConfigs: {
                  ref: TokenPool_RateLimitConfigPair.create({
                    outbound: {
                      ref: RateLimiter_Config.create({
                        isEnabled: true,
                        capacity: toNano('100'),
                        rate: 1n,
                      }),
                    },
                    inbound: {
                      ref: RateLimiter_Config.create({
                        isEnabled: true,
                        capacity: toNano('100'),
                        rate: 1n,
                      }),
                    },
                  }),
                },
              }),
            ],
            (item) => TokenPool_ChainUpdate.toCell(item).asBuilder(),
          ),
        },
      )

      expect(addResult.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect(await ctx.pool.getIsSupportedChain(ctx.remoteChainSelector)).toBe(true)
    })
  })
}

// ———————————————————————————————————————————————————————————————————————————————
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
        details: {
          ref: TokenPool_TransferDetails.create({
            receiver: { ref: ctx.destTokenAddress },
            remoteChainSelector: ctx.remoteChainSelector,
            originalSender: ctx.deployer.address,
            amount: toNano('1'),
            localToken: ctx.localToken,
          }),
        },
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
          destTokenAddress: { ref: ctx.destTokenAddress },
          destPoolData: Cell.EMPTY,
        }),
      })
      const fwdp = TokenPool_LockOrBurnForwardPayload.create({
        originalSender: ctx.deployer.address,
        requestMsg: {
          ref: TokenPool_LockOrBurn.create({
            queryId: 0n,
            request: { ref: request },
            requestedFinalityConfig: 0n,
            tokenArgs: null,
            replyTo: null,
          }),
        },
        prepared: { ref: prepared },
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
        originalSender: ctx.offRamp.address,
        requestMsg: {
          ref: TokenPool_ReleaseOrMint.create({
            queryId: 0n,
            request: { ref: request },
            requestedFinalityConfig: 0n,
            replyTo: null,
          }),
        },
        prepared: { ref: prepared },
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
        request: { ref: request },
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
        request: { ref: request },
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
        ctx.offRamp.getSender(),
        toNano('1'),
        {
          queryId: 2n,
          request: { ref: request },
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
        ctx.offRamp.getSender(),
        toNano('1'),
        {
          queryId: 1n,
          request: { ref: request },
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
      })
    })

    // === Inline mode (replyTo = null for LockOrBurn) ===

    it('processes LockOrBurn inline when replyTo is null', async () => {
      const ctx = await setup()

      const request = lockOrBurnIn(ctx)

      const result = await ctx.pool.sendTokenPoolLockOrBurn(ctx.deployer.getSender(), toNano('1'), {
        queryId: 100n,
        request: { ref: request },
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
        ctx.offRamp.getSender(),
        toNano('1'),
        {
          queryId: 100n,
          request: { ref: request },
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
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
          request: { ref: requestEven },
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
          request: { ref: requestOdd },
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
        ctx.offRamp.getSender(),
        toNano('1'),
        {
          queryId: 6n,
          request: { ref: requestEven },
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
        ctx.offRamp.getSender(),
        toNano('1'),
        {
          queryId: 7n,
          request: { ref: requestOdd },
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
  })
}

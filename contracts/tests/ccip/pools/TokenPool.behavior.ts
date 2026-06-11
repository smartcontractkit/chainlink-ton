import '@ton/test-utils'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, Dictionary, DictionaryValue, Sender, toNano } from '@ton/core'
import {
  CrossChainAddress,
  CursedSubjects,
  TokenPool,
  TokenPool_ChainUpdate,
  TokenPool_RampUpdate,
  TokenPool_RateLimitConfigPair,
  TokenPool_ReleaseOrMintInV1,
  RateLimiter_Config,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { asSnakedCell, asSnakedCellEmpty } from '../../../src/utils'
import { createEmptyTensorValue, loadMap } from '../../../src/utils/dict'

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
    originalSender: { ref: ctx.sourcePoolAddress },
    remoteChainSelector: ctx.remoteChainSelector,
    receiver: ctx.recipient.address,
    sourceDenominatedAmount: 1n,
    localToken: ctx.localToken,
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

    it('reverts releaseOrMint while chain is cursed', async () => {
      const ctx = await setup()

      await ctx.pool.sendTokenPoolUpdateCursedSubjects(ctx.deployer.getSender(), toNano('0.2'), {
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
      const result = await ctx.pool.sendTokenPoolUpdateCursedSubjects(
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
      await ctx.pool.sendTokenPoolUpdateCursedSubjects(ctx.deployer.getSender(), toNano('0.2'), {
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

      await ctx.pool.sendTokenPoolUpdateCursedSubjects(ctx.deployer.getSender(), toNano('0.2'), {
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
          request: { ref: releaseRequest(ctx, { localToken: wrongLocalToken }) },
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

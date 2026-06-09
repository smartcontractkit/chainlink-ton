import '@ton/test-utils'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, Sender, toNano } from '@ton/core'
import { ReleaseOrMintInV1 } from '../../../wrappers/ccip/TokenPool'

export type TokenPoolBehaviorContext = {
  pool: {
    sendApplyChainUpdates: (
      via: Sender,
      value: bigint,
      body: { queryId: bigint; remove: bigint[]; add: ChainUpdateInput[] },
    ) => Promise<{ transactions: unknown[] }>
    sendUpdateRampAccess: (
      via: Sender,
      value: bigint,
      body: {
        queryId: bigint
        updates: {
          remoteChainSelector: bigint
          onRamp: Address | null
          offRamp: Address | null
        }[]
      },
    ) => Promise<{ transactions: unknown[] }>
    sendUpdateCursedSubjects: (
      via: Sender,
      value: bigint,
      cursedSubjects: bigint[],
    ) => Promise<{ transactions: unknown[] }>
    sendReleaseOrMint: (
      via: Sender,
      value: bigint,
      body: {
        queryId: bigint
        request: ReleaseOrMintInV1
        requestedFinalityConfig?: number
        replyTo?: Address | null
      },
    ) => Promise<{ transactions: unknown[] }>
    getVerifyNotCursed: (subject: bigint) => Promise<boolean>
    getOnRamp: (remoteChainSelector: bigint) => Promise<Address | null>
    getOffRamp: (remoteChainSelector: bigint) => Promise<Address | null>
    getIsSupportedChain: (remoteChainSelector: bigint) => Promise<boolean>
    address: Address
  }
  deployer: SandboxContract<TreasuryContract>
  offRamp: SandboxContract<TreasuryContract>
  unauthorized: SandboxContract<TreasuryContract>
  recipient: SandboxContract<TreasuryContract>
  onRampAddress: Address
  remoteChainSelector: bigint
  destTokenAddress: Cell
  sourcePoolAddress: Cell
  localToken: Address
}

type ChainUpdateInput = {
  remoteChainSelector: bigint
  remotePoolAddresses: Cell[]
  remoteTokenAddress: Cell
  outboundRateLimiterConfig: { isEnabled: boolean; capacity: bigint; rate: bigint }
  inboundRateLimiterConfig: { isEnabled: boolean; capacity: bigint; rate: bigint }
}

function releaseRequest(
  ctx: TokenPoolBehaviorContext,
  overrides: Partial<ReleaseOrMintInV1> = {},
): ReleaseOrMintInV1 {
  return {
    originalSender: ctx.sourcePoolAddress,
    remoteChainSelector: ctx.remoteChainSelector,
    receiver: ctx.recipient.address,
    sourceDenominatedAmount: 1n,
    localToken: ctx.localToken,
    sourcePoolAddress: ctx.sourcePoolAddress,
    sourcePoolData: null,
    offchainTokenData: null,
    ...overrides,
  }
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

      const result = await ctx.pool.sendReleaseOrMint(ctx.unauthorized.getSender(), toNano('0.3'), {
        queryId: 901n,
        request: releaseRequest(ctx),
        requestedFinalityConfig: 0,
        replyTo: ctx.deployer.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('reverts releaseOrMint while chain is cursed', async () => {
      const ctx = await setup()

      await ctx.pool.sendUpdateCursedSubjects(ctx.deployer.getSender(), toNano('0.2'), [ctx.remoteChainSelector])
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(false)

      const result = await ctx.pool.sendReleaseOrMint(ctx.offRamp.getSender(), toNano('0.3'), {
        queryId: 902n,
        request: releaseRequest(ctx),
        requestedFinalityConfig: 0,
        replyTo: ctx.deployer.address,
      })

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
      const result = await ctx.pool.sendApplyChainUpdates(ctx.unauthorized.getSender(), toNano('0.2'), {
        queryId: 903n,
        remove: [],
        add: [],
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects updateRampAccess from non-owner', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendUpdateRampAccess(ctx.unauthorized.getSender(), toNano('0.2'), {
        queryId: 904n,
        updates: [
          {
            remoteChainSelector: ctx.remoteChainSelector,
            onRamp: ctx.onRampAddress,
            offRamp: ctx.unauthorized.address,
          },
        ],
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects cursed-subject updates from non-rmn sender', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendUpdateCursedSubjects(ctx.unauthorized.getSender(), toNano('0.2'), [
        ctx.remoteChainSelector,
      ])

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('can clear cursed subject back to not cursed', async () => {
      const ctx = await setup()
      await ctx.pool.sendUpdateCursedSubjects(ctx.deployer.getSender(), toNano('0.2'), [ctx.remoteChainSelector])
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(false)

      await ctx.pool.sendUpdateCursedSubjects(ctx.deployer.getSender(), toNano('0.2'), [])
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(true)
    })

    it('removes configured chain via applyChainUpdates', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendApplyChainUpdates(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 905n,
        remove: [ctx.remoteChainSelector],
        add: [],
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect(await ctx.pool.getIsSupportedChain(ctx.remoteChainSelector)).toBe(false)
    })

    it('reverts releaseOrMint after configured chain is removed', async () => {
      const ctx = await setup()
      await ctx.pool.sendApplyChainUpdates(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 906n,
        remove: [ctx.remoteChainSelector],
        add: [],
      })

      const result = await ctx.pool.sendReleaseOrMint(ctx.offRamp.getSender(), toNano('0.3'), {
        queryId: 907n,
        request: releaseRequest(ctx),
        requestedFinalityConfig: 0,
        replyTo: ctx.deployer.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects removing a non-existent chain', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendApplyChainUpdates(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 908n,
        remove: [ctx.remoteChainSelector + 1n],
        add: [],
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('can replace off-ramp mapping via updateRampAccess', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendUpdateRampAccess(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 909n,
        updates: [
          {
            remoteChainSelector: ctx.remoteChainSelector,
            onRamp: ctx.onRampAddress,
            offRamp: ctx.unauthorized.address,
          },
        ],
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect(await ctx.pool.getOffRamp(ctx.remoteChainSelector)).toEqualAddress(ctx.unauthorized.address)
    })

    it('rejects old off-ramp sender after remapping off-ramp', async () => {
      const ctx = await setup()
      await ctx.pool.sendUpdateRampAccess(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 910n,
        updates: [
          {
            remoteChainSelector: ctx.remoteChainSelector,
            onRamp: ctx.onRampAddress,
            offRamp: ctx.unauthorized.address,
          },
        ],
      })

      const result = await ctx.pool.sendReleaseOrMint(ctx.offRamp.getSender(), toNano('0.3'), {
        queryId: 911n,
        request: releaseRequest(ctx),
        requestedFinalityConfig: 0,
        replyTo: ctx.deployer.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects releaseOrMint when source pool is not configured', async () => {
      const ctx = await setup()
      const wrongSourcePoolAddress = beginCell().storeUint(4, 8).storeBuffer(Buffer.from('evil')).endCell()
      const result = await ctx.pool.sendReleaseOrMint(ctx.offRamp.getSender(), toNano('0.3'), {
        queryId: 912n,
        request: releaseRequest(ctx, { sourcePoolAddress: wrongSourcePoolAddress }),
        requestedFinalityConfig: 0,
        replyTo: ctx.deployer.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects releaseOrMint when local token does not match pool token', async () => {
      const ctx = await setup()
      const wrongLocalToken = ctx.deployer.address
      const result = await ctx.pool.sendReleaseOrMint(ctx.offRamp.getSender(), toNano('0.3'), {
        queryId: 913n,
        request: releaseRequest(ctx, { localToken: wrongLocalToken }),
        requestedFinalityConfig: 0,
        replyTo: ctx.deployer.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('clears existing off-ramp when update passes null off-ramp', async () => {
      const ctx = await setup()
      await ctx.pool.sendUpdateRampAccess(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 914n,
        updates: [
          {
            remoteChainSelector: ctx.remoteChainSelector,
            onRamp: ctx.onRampAddress,
            offRamp: null,
          },
        ],
      })

      expect(await ctx.pool.getOffRamp(ctx.remoteChainSelector)).toBeNull()
    })

    it('rejects existing off-ramp sender after null off-ramp update', async () => {
      const ctx = await setup()
      await ctx.pool.sendUpdateRampAccess(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 915n,
        updates: [
          {
            remoteChainSelector: ctx.remoteChainSelector,
            onRamp: ctx.onRampAddress,
            offRamp: null,
          },
        ],
      })

      const result = await ctx.pool.sendReleaseOrMint(ctx.offRamp.getSender(), toNano('0.3'), {
        queryId: 916n,
        request: releaseRequest(ctx),
        requestedFinalityConfig: 0,
        replyTo: ctx.deployer.address,
      })

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('can re-add chain after remove via applyChainUpdates', async () => {
      const ctx = await setup()

      await ctx.pool.sendApplyChainUpdates(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 917n,
        remove: [ctx.remoteChainSelector],
        add: [],
      })

      const addResult = await ctx.pool.sendApplyChainUpdates(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 918n,
        remove: [],
        add: [
          {
            remoteChainSelector: ctx.remoteChainSelector,
            remotePoolAddresses: [ctx.sourcePoolAddress],
            remoteTokenAddress: ctx.destTokenAddress,
            outboundRateLimiterConfig: { isEnabled: true, capacity: toNano('100'), rate: 1n },
            inboundRateLimiterConfig: { isEnabled: true, capacity: toNano('100'), rate: 1n },
          },
        ],
      })

      expect(addResult.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect(await ctx.pool.getIsSupportedChain(ctx.remoteChainSelector)).toBe(true)
    })
  })
}

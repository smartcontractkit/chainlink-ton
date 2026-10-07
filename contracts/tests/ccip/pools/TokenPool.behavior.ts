import '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, Cell, Slice, toNano } from '@ton/core'
import {
  AccessControl_GrantRole,
  CrossChainAddress,
  CursedSubjects,
  TokenPool,
  TokenPool_ChainUpdate,
  TokenPool_DeliveredTransfer,
  TokenPool_DeliveryMetadata,
  TokenPool_RateLimitConfigPair,
  TokenPool_RateLimitConfigArgs,
  TokenPool_ReleaseOrMint,
  TokenPool_ReleaseOrMintFailure,
  TransferNotificationForRecipient,
  TokenPool_ReleaseOrMintForwardPayload,
  TokenPool_ReleaseOrMintInV1,
  RateLimiter_Config,
  TokenPool_Transfer,
  TokenPool_TransferDetails,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { CURSE_ROLE } from '../../../wrappers/ccip/Router'
import { BurnMintTokenPool } from '../../../wrappers/gen/ccip/pools/BurnMintTokenPool'
import { getExternals, testLog } from '../../Logs'
import {
  Ownable2Step_AcceptOwnership,
  Ownable2Step_TransferOwnership,
} from '../../../wrappers/gen/ccip/Router'

export type TokenPoolBehaviorContext = {
  pool: SandboxContract<TokenPool>
  blockchain: Blockchain
  deployer: SandboxContract<TreasuryContract>
  offRamp: SandboxContract<TreasuryContract>
  unauthorized: SandboxContract<TreasuryContract>
  recipient: SandboxContract<TreasuryContract>
  onRampAddress: Address
  remoteChainSelector: bigint
  destTokenAddress: CrossChainAddress
  sourcePoolAddress: CrossChainAddress
  localToken: Address
  /** Expected `transferInitiator` of the pool's release/mint delivery; defaults to the pool. */
  releaseOrMintInitiator?: Address
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

// TokenPool_Error codes are shared by every pool built on the TokenPool library.
const TokenPoolErrors = BurnMintTokenPool.Errors

const DEPOSIT_ACCOUNT_NOTIFY_PREFIX = 0x88e0ef3e

/** Returns the `notify` target of a `DepositAccount_Notify` envelope boxed in a jetton forward payload. */
export function parseDepositAccountNotify(forwardPayload: Slice): Address | null {
  const payload = forwardPayload.clone()
  const envelope = payload.loadBit() ? payload.loadRef().beginParse() : payload
  if (envelope.remainingBits < 32 || envelope.loadUint(32) !== DEPOSIT_ACCOUNT_NOTIFY_PREFIX) {
    return null
  }
  return envelope.loadAddress()
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
    it('reports the configured chain as supported after setup', async () => {
      const ctx = await setup()

      expect(await ctx.pool.getIsSupportedChain(ctx.remoteChainSelector)).toBe(true)
    })

    it('reverts releaseOrMint when caller is not the configured Router', async () => {
      const ctx = await setup()

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.unauthorized.getSender(),
        toNano('0.3'),
        {
          queryId: 901n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          receiverAccount: ctx.recipient.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
        exitCode: 51710, // TokenPool_Error.Unauthorized
      })
    })

    it('does not authorize an OffRamp to call the pool directly', async () => {
      const ctx = await setup()

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.offRamp.getSender(),
        toNano('0.3'),
        {
          queryId: 900n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          receiverAccount: ctx.recipient.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.offRamp.address,
        to: ctx.pool.address,
        success: false,
        exitCode: 51710, // TokenPool_Error.Unauthorized
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
          forwardPayload: Cell.EMPTY.beginParse(),
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
        exitCode: 51710, // TokenPool_Error.Unauthorized (facility 517 → base 51700, +10)
      })
    })

    it('reverts releaseOrMint while chain is cursed', async () => {
      const ctx = await setup()

      await ctx.pool.sendTokenPoolCurse(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 901n,
        subjects: [ctx.remoteChainSelector],
      })
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(false)

      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('0.3'),
        {
          queryId: 902n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          receiverAccount: ctx.recipient.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
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
        ctx.deployer.getSender(),
        toNano('0.3'),
        {
          queryId: 931n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          receiverAccount: ctx.recipient.address,
        },
      )
      expect(first.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })

      // Second release of the same amount must be rejected (bucket has no refill, rate=0).
      const second = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('0.3'),
        {
          queryId: 932n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          receiverAccount: ctx.recipient.address,
        },
      )
      expect(second.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
      })
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

    it('rejects cursed-subject updates from non-rmn sender', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolCurse(
        ctx.unauthorized.getSender(),
        toNano('0.2'),
        {
          queryId: 904n,
          subjects: [ctx.remoteChainSelector],
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
      await ctx.pool.sendTokenPoolCurse(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 901n,
        subjects: [ctx.remoteChainSelector],
      })
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(false)

      await ctx.pool.sendTokenPoolUncurse(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 902n,
        subjects: [ctx.remoteChainSelector],
      })
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(true)
    })

    // The pool's curse policy is defence in depth and off the fast-curse path,
    // but it shares the Router's authorization model: the owner is an implicit
    // DEFAULT_ADMIN and can delegate CURSE_ROLE.
    it('lets the owner grant CURSE_ROLE to a delegate', async () => {
      const ctx = await setup()
      const granted = await ctx.pool.sendTokenPoolRMNAccessControlMessage(
        ctx.deployer.getSender(),
        toNano('0.2'),
        {
          content: AccessControl_GrantRole.create({
            queryId: 905n,
            role: CURSE_ROLE,
            account: ctx.unauthorized.address,
          }),
        },
      )
      expect(granted.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })

      const cursed = await ctx.pool.sendTokenPoolCurse(
        ctx.unauthorized.getSender(),
        toNano('0.2'),
        {
          queryId: 906n,
          subjects: [ctx.remoteChainSelector],
        },
      )
      expect(cursed.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: true,
      })
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(false)

      // CURSE_ROLE alone does not confer the power to lift a curse.
      const uncursed = await ctx.pool.sendTokenPoolUncurse(
        ctx.unauthorized.getSender(),
        toNano('0.2'),
        { queryId: 907n, subjects: [ctx.remoteChainSelector] },
      )
      expect(uncursed.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects a role grant from a non-owner', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolRMNAccessControlMessage(
        ctx.unauthorized.getSender(),
        toNano('0.2'),
        {
          content: AccessControl_GrantRole.create({
            queryId: 908n,
            role: CURSE_ROLE,
            account: ctx.unauthorized.address,
          }),
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    // Curse administration is independent of pool ownership: transferring the
    // administrator away strips the owner of curse authority and leaves pool
    // ownership untouched.
    it('separates the curse administrator from the pool owner', async () => {
      const ctx = await setup()
      const newAdmin = ctx.unauthorized

      expect(await ctx.pool.getRmnOwner()).toEqualAddress(ctx.deployer.address)

      await ctx.pool.sendTokenPoolRMNOwnableMessage(ctx.deployer.getSender(), toNano('0.2'), {
        content: Ownable2Step_TransferOwnership.toCell(
          Ownable2Step_TransferOwnership.create({ queryId: 910n, newOwner: newAdmin.address }),
        ).asSlice(),
      })
      await ctx.pool.sendTokenPoolRMNOwnableMessage(newAdmin.getSender(), toNano('0.2'), {
        content: Ownable2Step_AcceptOwnership.toCell(
          Ownable2Step_AcceptOwnership.create({ queryId: 911n }),
        ).asSlice(),
      })

      expect(await ctx.pool.getRmnOwner()).toEqualAddress(newAdmin.address)
      expect(await ctx.pool.getOwner()).toEqualAddress(ctx.deployer.address)
      expect(await ctx.pool.getRmnCanCurse(newAdmin.address)).toBe(true)
      expect(await ctx.pool.getRmnCanCurse(ctx.deployer.address)).toBe(false)

      const byOwner = await ctx.pool.sendTokenPoolCurse(ctx.deployer.getSender(), toNano('0.2'), {
        queryId: 912n,
        subjects: [ctx.remoteChainSelector],
      })
      expect(byOwner.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
      })
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(true)

      const byAdmin = await ctx.pool.sendTokenPoolCurse(newAdmin.getSender(), toNano('0.2'), {
        queryId: 913n,
        subjects: [ctx.remoteChainSelector],
      })
      expect(byAdmin.transactions).toHaveTransaction({
        from: newAdmin.address,
        to: ctx.pool.address,
        success: true,
      })
      expect(await ctx.pool.getVerifyNotCursed(ctx.remoteChainSelector)).toBe(false)
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
        ctx.deployer.getSender(),
        toNano('0.3'),
        {
          queryId: 907n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          receiverAccount: ctx.recipient.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
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

    it('rejects releaseOrMint when source pool is not configured', async () => {
      const ctx = await setup()
      const wrongSourcePoolAddress = beginCell()
        .storeUint(4, 8)
        .storeBuffer(Buffer.from('evil'))
        .endCell()
        .beginParse()
      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('0.3'),
        {
          queryId: 912n,
          request: releaseRequest(ctx, { sourcePoolAddress: wrongSourcePoolAddress }),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          receiverAccount: ctx.recipient.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects releaseOrMint when local token does not match pool token', async () => {
      const ctx = await setup()
      const wrongLocalToken = ctx.deployer.address
      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
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
          receiverAccount: ctx.recipient.address,
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
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
        receiverAccount: ctx.recipient.address,
      }

      const first = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('0.6'),
        repeatedRequest,
      )
      const second = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('0.6'),
        repeatedRequest,
      )

      // Each release lands in the receiver account's jetton wallet, which notifies the account with
      // the pool's `DepositAccount_Notify` envelope routing the notification to `replyTo`.
      const allTransactions = [...first.transactions, ...second.transactions]
      const completions = allTransactions.filter((tx: any) => {
        const body = tx.inMessage?.body
        if (!body || !tx.inMessage?.info?.dest?.equals?.(ctx.recipient.address)) {
          return false
        }
        const slice = body.beginParse()
        if (
          slice.remainingBits < 32 ||
          slice.preloadUint(32) !== TransferNotificationForRecipient.PREFIX
        ) {
          return false
        }
        const notification = TransferNotificationForRecipient.fromSlice(slice)
        const notify = parseDepositAccountNotify(notification.forwardPayload)
        return (
          notification.queryId === queryId &&
          notification.jettonAmount === amount &&
          notify?.equals(ctx.deployer.address) === true
        )
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

    it('rejects releaseOrMint without a receiver account', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('0.6'),
        {
          queryId: 940n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          receiverAccount: null,
        },
      )
      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
        exitCode: TokenPoolErrors['TokenPool_Error.UnsupportedOperation'],
      })
    })

    const deliveredTransfer = (ctx: TokenPoolBehaviorContext, token: Address = ctx.localToken) =>
      TokenPool_DeliveredTransfer.create({
        remoteChainSelector: ctx.remoteChainSelector,
        localToken: token,
        receiver: ctx.recipient.address,
        amount: 7n,
      })

    it('emits ReleasedOrMinted when the Router reports the transfer was delivered', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolReleaseOrMintDelivered(
        ctx.deployer.getSender(),
        toNano('0.1'),
        { queryId: 941n, transfer: deliveredTransfer(ctx) },
      )
      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      const events = getExternals(result.transactions).filter((ext) =>
        testLog(ext, ctx.pool.address, 'TokenPool_ReleasedOrMinted', (body) => {
          // TokenPool_ReleasedOrMinted { remoteChainSelector, details: ^{ token, sender, amount, ^recipient } }
          const event = body.beginParse()
          const remoteChainSelector = event.loadUintBig(64)
          const details = event.loadRef().beginParse()
          const token = details.loadAddress()
          details.loadAddress()
          const amount = details.loadCoins()
          const recipient = details.loadRef().beginParse().loadAddress()
          return (
            remoteChainSelector === ctx.remoteChainSelector &&
            token.equals(ctx.localToken) &&
            amount === 7n &&
            recipient.equals(ctx.recipient.address)
          )
        }),
      )
      expect(events).toHaveLength(1)
    })

    it('rejects ReleaseOrMintDelivered from a non-Router sender', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolReleaseOrMintDelivered(
        ctx.unauthorized.getSender(),
        toNano('0.1'),
        { queryId: 942n, transfer: deliveredTransfer(ctx) },
      )
      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
        exitCode: TokenPoolErrors['TokenPool_Error.Unauthorized'],
      })
      expect(getExternals(result.transactions)).toHaveLength(0)
    })

    it('rejects ReleaseOrMintDelivered for a token other than the pool token', async () => {
      const ctx = await setup()
      const result = await ctx.pool.sendTokenPoolReleaseOrMintDelivered(
        ctx.deployer.getSender(),
        toNano('0.1'),
        { queryId: 943n, transfer: deliveredTransfer(ctx, ctx.unauthorized.address) },
      )
      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
        exitCode: TokenPoolErrors['TokenPool_Error.InvalidToken'],
      })
    })

    it('answers GetReleaseOrMintDeliveryMetadata with the wallet, initiator and local amount', async () => {
      const ctx = await setup()
      const owner = ctx.recipient.address
      const expectedWallet = (
        await ctx.blockchain
          .provider(ctx.localToken)
          .get('get_wallet_address', [
            { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
          ])
      ).stack.readAddress()
      const localDecimals = await ctx.pool.getTokenDecimals()
      const cases = [
        { sourcePoolData: null, amount: 12345000n, expected: 12345000n },
        {
          sourcePoolData: beginCell()
            .storeUint(localDecimals + 3n, 256)
            .endCell(),
          amount: 12345000n,
          expected: 12345n,
        },
      ]

      for (const [i, c] of cases.entries()) {
        const queryId = 944n + BigInt(i)
        // Permissionless: anyone may query.
        const result = await ctx.pool.sendTokenPoolGetReleaseOrMintDeliveryMetadata(
          ctx.unauthorized.getSender(),
          toNano('0.1'),
          { queryId, owner, amount: c.amount, sourcePoolData: c.sourcePoolData },
        )
        expect(result.transactions).toHaveTransaction({
          from: ctx.pool.address,
          to: ctx.unauthorized.address,
          success: true,
          op: TokenPool_DeliveryMetadata.PREFIX,
          body(body) {
            if (!body) return false
            const reply = TokenPool_DeliveryMetadata.fromSlice(body.beginParse())
            return (
              reply.queryId === queryId &&
              reply.owner.equals(owner) &&
              reply.wallet.equals(expectedWallet) &&
              reply.transferInitiator.equals(ctx.releaseOrMintInitiator ?? ctx.pool.address) &&
              reply.amount === c.expected
            )
          },
        })
      }
    })
  })
}

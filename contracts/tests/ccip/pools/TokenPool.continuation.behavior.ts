import '@ton/test-utils'
import { findTransactionRequired } from '@ton/test-utils'
import { toNano } from '@ton/core'
import { BlockchainTransaction } from '@ton/sandbox'
import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import { JettonLockBox_Withdraw } from '../../../wrappers/gen/ccip/pools/JettonLockBox'
import { MintNewJettons } from '../../../wrappers/gen/ccip/cct/JettonMinter'
import {
  TokenPool_LockOrBurnFailure,
  TokenPool_LockOrBurnFinished,
  TokenPool_LockOrBurnForwardPayload,
  TokenPool_LockOrBurnInV1,
  TokenPool_LockOrBurnWithdraw,
  TokenPool_ReleaseOrMintFailure,
  TokenPool_Transfer,
  TokenPool_TransferDetails,
  TransferNotificationForRecipient,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { setTokenPoolSafetyFloor } from '../../utils/minValue'
import { deliveryTo, releaseRequest, TokenPoolBehaviorContext } from './TokenPool.behavior'

const INSUFFICIENT_MESSAGE_VALUE = 51725n // TokenPool_Error.InsufficientMessageValue

// Policy regressions on real message chains, not gas calibration. Each floor is fixed
// before the operation; callback-value assertions establish which side of it was exercised.
export function runTokenPoolContinuationBehaviorTests(
  name: string,
  setup: () => Promise<TokenPoolBehaviorContext>,
) {
  function releaseOneToken(ctx: TokenPoolBehaviorContext, value = toNano('0.6')) {
    return ctx.pool.sendTokenPoolReleaseOrMint(ctx.deployer.getSender(), value, {
      queryId: 1n,
      request: releaseRequest(ctx),
      requestedFinalityConfig: 0n,
      replyTo: ctx.deployer.address,
      delivery: deliveryTo(ctx.recipient.address, ctx.deployer.address),
    })
  }

  function continuedDirectly(transactions: BlockchainTransaction[]) {
    return transactions.some((tx) => {
      const message = tx.inMessage
      if (message?.info.type !== 'internal') return false
      const body = message.body.beginParse()
      if (body.remainingBits < 32) return false
      const op = body.preloadUint(32)
      return op === MintNewJettons.PREFIX || op === JettonLockBox_Withdraw.PREFIX
    })
  }

  describe(`${name} continuation value policy`, () => {
    it('aborts before mint/withdraw when the inbound release is below the safety floor', async () => {
      const ctx = await setup()
      const floor = toNano('0.57')
      await setTokenPoolSafetyFloor(ctx.blockchain, ctx.pool.address, floor)
      const capacityBefore = await ctx.pool.getCurrentRateLimiterState(
        ctx.remoteChainSelector,
        false,
      )

      // The inbound release itself is gated now that there is no account-reply hop.
      const { transactions } = await releaseOneToken(ctx, floor - 1n)

      expect(transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
        exitCode: Number(INSUFFICIENT_MESSAGE_VALUE),
      })
      expect(transactions).not.toHaveTransaction({
        from: ctx.pool.address,
        op: MintNewJettons.PREFIX,
      })
      expect(transactions).not.toHaveTransaction({
        from: ctx.pool.address,
        op: JettonLockBox_Withdraw.PREFIX,
      })
      const capacityAfter = await ctx.pool.getCurrentRateLimiterState(
        ctx.remoteChainSelector,
        false,
      )
      expect(capacityAfter.inbound.tokens).toEqual(capacityBefore.inbound.tokens)
    })

    it('mints/withdraws directly without a post-commit delivery value recheck', async () => {
      const ctx = await setup()
      const floor = toNano('0.1')
      await setTokenPoolSafetyFloor(ctx.blockchain, ctx.pool.address, floor)
      const capacityBefore = await ctx.pool.getCurrentRateLimiterState(
        ctx.remoteChainSelector,
        false,
      )

      const { transactions } = await releaseOneToken(ctx)

      // The pool delivers straight to the recipient; there is no account reply/notification
      // hop back to the pool where a second value gate could abort a committed release.
      expect(continuedDirectly(transactions)).toBe(true)
      expect(transactions).not.toHaveTransaction({
        from: ctx.pool.address,
        op: TokenPool_ReleaseOrMintFailure.PREFIX,
      })
      const capacityAfter = await ctx.pool.getCurrentRateLimiterState(
        ctx.remoteChainSelector,
        false,
      )
      expect(capacityAfter.inbound.tokens).toEqual(capacityBefore.inbound.tokens - 1n)
    })

    it('returns received custody and restores capacity when its notification is below the custody forward', async () => {
      const ctx = await setup()
      const floor = toNano('0.3')
      await setTokenPoolSafetyFloor(ctx.blockchain, ctx.pool.address, floor)
      const capacityBefore = await ctx.pool.getCurrentRateLimiterState(
        ctx.remoteChainSelector,
        false,
      )
      const admitted = await ctx.pool.sendTokenPoolLockOrBurn(
        ctx.deployer.getSender(),
        floor * 2n,
        {
          queryId: 1n,
          request: TokenPool_LockOrBurnInV1.create({
            transfer: TokenPool_Transfer.create({
              id: 1n,
              details: TokenPool_TransferDetails.create({
                receiver: ctx.destTokenAddress,
                remoteChainSelector: ctx.remoteChainSelector,
                originalSender: ctx.deployer.address,
                amount: 1n,
                localToken: ctx.localToken,
              }),
            }),
          }),
          requestedFinalityConfig: 0n,
          tokenArgs: null,
          replyTo: ctx.deployer.address,
        },
      )
      const withdraw = findTransactionRequired(admitted.transactions, {
        from: ctx.pool.address,
        to: ctx.deployer.address,
        op: TokenPool_LockOrBurnWithdraw.PREFIX,
      })
      const { forwardPayload } = TokenPool_LockOrBurnWithdraw.fromSlice(
        withdraw.inMessage!.body.beginParse(),
      )
      const minter = ctx.blockchain.openContract(JettonMinter.createFromAddress(ctx.localToken))
      const wallet = ctx.blockchain.openContract(
        JettonWallet.createFromAddress(await minter.getWalletAddress(ctx.deployer.address)),
      )
      const tokensBefore = await wallet.getJettonBalance()

      const { transactions } = await wallet.sendTransfer(ctx.deployer.getSender(), {
        value: toNano('0.6'),
        message: {
          queryId: 1,
          jettonAmount: 1n,
          destination: ctx.pool.address,
          responseDestination: ctx.deployer.address,
          customPayload: null,
          forwardTonAmount: toNano('0.2'), // Below the 2S custody forward, but enough to fund the return.
          forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
        },
      })

      expect(transactions).toHaveTransaction({
        to: ctx.pool.address,
        op: TransferNotificationForRecipient.PREFIX,
        value: (value) => value !== undefined && value < floor * 2n,
        success: true,
      })
      expect(transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        body: TokenPool_LockOrBurnFailure.toCell({
          $: 'TokenPool_LockOrBurnFailure',
          queryId: 1n,
          errorCode: INSUFFICIENT_MESSAGE_VALUE,
        }),
      })
      expect(transactions).not.toHaveTransaction({
        from: ctx.pool.address,
        op: TokenPool_LockOrBurnFinished.PREFIX,
      })
      expect(await wallet.getJettonBalance()).toEqual(tokensBefore)
      const capacityAfter = await ctx.pool.getCurrentRateLimiterState(
        ctx.remoteChainSelector,
        false,
      )
      expect(capacityAfter.outbound.tokens).toEqual(capacityBefore.outbound.tokens)
    })
  })
}

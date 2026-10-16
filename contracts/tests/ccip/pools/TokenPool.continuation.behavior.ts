import '@ton/test-utils'
import { findTransactionRequired } from '@ton/test-utils'
import { toNano } from '@ton/core'
import { BlockchainTransaction, internal } from '@ton/sandbox'
import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import {
  DepositAccount_Reply,
  DepositAccount_ForwardNotification,
} from '../../../wrappers/gen/ccip/DepositAccount'
import { JettonLockBox_Withdraw } from '../../../wrappers/gen/ccip/pools/JettonLockBox'
import { MintNewJettons } from '../../../wrappers/gen/ccip/cct/JettonMinter'
import {
  TokenPool_LockOrBurnFailure,
  TokenPool_LockOrBurnFinished,
  TokenPool_LockOrBurnForwardPayload,
  TokenPool_LockOrBurnInV1,
  TokenPool_LockOrBurnWithdraw,
  TokenPool_ReleaseOrMintFailure,
  TokenPool_ReleaseOrMintFinished,
  TokenPool_ReleaseOrMint,
  TokenPool_Transfer,
  TokenPool_TransferDetails,
  TransferNotificationForRecipient,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { setTokenPoolSafetyFloor } from '../../utils/minValue'
import { releaseRequest, TokenPoolBehaviorContext } from './TokenPool.behavior'

const INSUFFICIENT_MESSAGE_VALUE = 51726n // TokenPool_Error.InsufficientMessageValue

// Policy regressions on real message chains. Pre-commit callbacks enforce safety; committed
// delivery must complete even if its value falls below the configured floor.
export function runTokenPoolContinuationBehaviorTests(
  name: string,
  setup: () => Promise<TokenPoolBehaviorContext>,
) {
  async function releaseOneToken(ctx: TokenPoolBehaviorContext, deliverySafetyFloor?: bigint) {
    const request = {
      queryId: 1n,
      request: releaseRequest(ctx),
      requestedFinalityConfig: 0n,
      replyTo: ctx.deployer.address,
    }
    if (deliverySafetyFloor === undefined) {
      return ctx.pool.sendTokenPoolReleaseOrMint(ctx.deployer.getSender(), toNano('0.6'), request)
    }

    // Raise the fixture's safety floor only after tokens are delivered to the account. Earlier
    // gates must pass; the final, committed notification must not apply a new gate.
    const transactions: BlockchainTransaction[] = []
    const chain = await ctx.blockchain.sendMessageIter(
      internal({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        value: toNano('0.6'),
        body: TokenPool_ReleaseOrMint.toCell(TokenPool_ReleaseOrMint.create(request)),
      }),
    )
    for await (const tx of chain) {
      transactions.push(tx)
      for (const message of tx.outMessages.values()) {
        if (
          message.info.type === 'internal' &&
          message.info.dest.equals(ctx.pool.address) &&
          message.body.beginParse().remainingBits >= 32 &&
          message.body.beginParse().preloadUint(32) === DepositAccount_ForwardNotification.PREFIX
        ) {
          await setTokenPoolSafetyFloor(ctx.blockchain, ctx.pool.address, deliverySafetyFloor)
        }
      }
    }
    return { transactions }
  }

  describe(`${name} continuation value policy`, () => {
    it('aborts before mint/withdraw when the account-ready reply is below the safety floor', async () => {
      const ctx = await setup()
      const floor = toNano('0.57')
      await setTokenPoolSafetyFloor(ctx.blockchain, ctx.pool.address, floor)
      const capacityBefore = await ctx.pool.getCurrentRateLimiterState(
        ctx.remoteChainSelector,
        false,
      )

      const { transactions } = await releaseOneToken(ctx)

      expect(transactions).toHaveTransaction({
        to: ctx.pool.address,
        op: DepositAccount_Reply.PREFIX,
        value: (value) => value !== undefined && value < floor,
        success: true, // The pool handles the shortfall locally instead of rejecting the reply.
      })
      expect(transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        body: TokenPool_ReleaseOrMintFailure.toCell({
          $: 'TokenPool_ReleaseOrMintFailure',
          queryId: 1n,
          errorCode: INSUFFICIENT_MESSAGE_VALUE,
        }),
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

    it('does not recheck safety after mint/release has committed', async () => {
      const ctx = await setup()
      const floor = toNano('0.1')
      const deliveryFloor = toNano('1')
      await setTokenPoolSafetyFloor(ctx.blockchain, ctx.pool.address, floor)
      const capacityBefore = await ctx.pool.getCurrentRateLimiterState(
        ctx.remoteChainSelector,
        false,
      )

      const result = await releaseOneToken(ctx, deliveryFloor)

      expect(result.transactions).toHaveTransaction({
        to: ctx.pool.address,
        op: DepositAccount_Reply.PREFIX,
        value: (value) => value !== undefined && value >= floor,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        to: ctx.pool.address,
        op: DepositAccount_ForwardNotification.PREFIX,
        value: (value) => value !== undefined && value < deliveryFloor,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        op: TokenPool_ReleaseOrMintFinished.PREFIX,
        body: TokenPool_ReleaseOrMintFinished.toCell({
          $: 'TokenPool_ReleaseOrMintFinished',
          queryId: 1n,
          out: { $: 'TokenPool_ReleaseOrMintOutV1', destinationAmount: 1n },
        }),
      })
      expect(result.transactions).not.toHaveTransaction({
        from: ctx.pool.address,
        op: TokenPool_ReleaseOrMintFailure.PREFIX,
      })
      const capacityAfter = await ctx.pool.getCurrentRateLimiterState(
        ctx.remoteChainSelector,
        false,
      )
      expect(capacityAfter.inbound.tokens).toEqual(capacityBefore.inbound.tokens - 1n)
    })

    it('returns received custody and restores capacity when its notification is below the safety floor', async () => {
      const ctx = await setup()
      const floor = toNano('0.3')
      await setTokenPoolSafetyFloor(ctx.blockchain, ctx.pool.address, floor)
      const capacityBefore = await ctx.pool.getCurrentRateLimiterState(
        ctx.remoteChainSelector,
        false,
      )
      const admitted = await ctx.pool.sendTokenPoolLockOrBurn(
        ctx.deployer.getSender(),
        toNano('0.5'),
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
          forwardTonAmount: toNano('0.2'), // Below the floor, but enough to fund the custody return.
          forwardPayload: TokenPool_LockOrBurnForwardPayload.toCell(forwardPayload),
        },
      })

      expect(transactions).toHaveTransaction({
        to: ctx.pool.address,
        op: TransferNotificationForRecipient.PREFIX,
        value: (value) => value !== undefined && value < floor,
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

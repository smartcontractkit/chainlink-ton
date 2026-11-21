import '@ton/test-utils'
import { toNano } from '@ton/core'

import {
  AskToTransfer,
  TokenPool,
  TokenPool_LockOrBurnInV1,
  TokenPool_MessageDirection,
  TokenPool_ReleaseOrMintDelivery,
  TokenPool_Transfer,
  TokenPool_TransferDetails,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { BurnMintTokenPool } from '../../../wrappers/gen/ccip/pools/BurnMintTokenPool'
import { CCIPNamespace } from '../../../wrappers/ccip/NameSpace'
import { TokenPoolBehaviorContext, releaseRequest } from './TokenPool.behavior'

type JettonWalletClient = {
  sendTransfer: (via: any, body: any) => Promise<{ transactions: any[] }>
}

export type TokenPoolPreInitBehaviorContext = TokenPoolBehaviorContext & {
  deployerWallet: JettonWalletClient
}

function expectNotInitialized(
  result: { transactions: any[] },
  ctx: TokenPoolPreInitBehaviorContext,
) {
  expect(result.transactions).toHaveTransaction({
    from: ctx.deployer.address,
    to: ctx.pool.address,
    success: false,
    exitCode: BurnMintTokenPool.Errors['TokenPool_Error.ContractNotInitialized'],
  })

  const emitted = result.transactions.some((candidate) => {
    const info = candidate.inMessage?.info
    return info?.type === 'internal' && info.src.equals(ctx.pool.address) && !info.bounced
  })
  expect(emitted).toBe(false)
}

export function runTokenPoolPreInitBehaviorTests(
  name: string,
  makeContext: () => Promise<TokenPoolPreInitBehaviorContext>,
) {
  describe(`${name} pre-init`, () => {
    it('rejects operational requests before init', async () => {
      const ctx = await makeContext()

      const lockOrBurn = await ctx.pool.sendTokenPoolLockOrBurn(
        ctx.deployer.getSender(),
        toNano('0.3'),
        {
          queryId: 1n,
          request: TokenPool_LockOrBurnInV1.create({
            transfer: TokenPool_Transfer.create({
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
          finalizationValue: toNano('0.01'),
          onRampNamespaces: new Set([BigInt(CCIPNamespace.SenderAccount)]),
          extra: null,
        },
      )
      expectNotInitialized(lockOrBurn, ctx)

      const releaseOrMint = await ctx.pool.sendTokenPoolReleaseOrMint(
        ctx.deployer.getSender(),
        toNano('0.3'),
        {
          queryId: 2n,
          request: releaseRequest(ctx),
          requestedFinalityConfig: 0n,
          replyTo: ctx.deployer.address,
          delivery: TokenPool_ReleaseOrMintDelivery.create({
            recipient: ctx.recipient.address,
            forwardTonAmount: 0n,
            forwardPayload: null,
          }),
          sendExcessesTo: null,
        },
      )
      expectNotInitialized(releaseOrMint, ctx)

      const getConfig = await ctx.pool.sendTokenPoolGetConfig(
        ctx.deployer.getSender(),
        toNano('0.05'),
        {
          queryId: 3n,
        },
      )
      expectNotInitialized(getConfig, ctx)

      const getCCVs = await ctx.pool.sendTokenPoolGetCCVs(
        ctx.deployer.getSender(),
        toNano('0.05'),
        {
          queryId: 4n,
          localToken: ctx.localToken,
          remoteChainSelector: ctx.remoteChainSelector,
          amount: 1n,
          requestedFinalityConfig: 0n,
          direction: TokenPool_MessageDirection.Outbound,
          extraData: null,
          forwardPayload: null,
        },
      )
      expectNotInitialized(getCCVs, ctx)

      const getCCVsAndFees = await ctx.pool.sendTokenPoolGetCCVsAndFees(
        ctx.deployer.getSender(),
        toNano('0.05'),
        {
          queryId: 5n,
          localToken: ctx.localToken,
          remoteChainSelector: ctx.remoteChainSelector,
          amount: 1n,
          requestedFinalityConfig: 0n,
          direction: TokenPool_MessageDirection.Outbound,
          extraData: null,
          forwardPayload: null,
        },
      )
      expectNotInitialized(getCCVsAndFees, ctx)
    })

    it('returns jettons received before init', async () => {
      const ctx = await makeContext()
      const amount = toNano('1')

      const result = await ctx.deployerWallet.sendTransfer(ctx.deployer.getSender(), {
        value: toNano('1'),
        message: {
          queryId: 9002,
          jettonAmount: amount,
          destination: ctx.pool.address,
          responseDestination: ctx.deployer.address,
          customPayload: null,
          forwardTonAmount: toNano('0.05'),
          forwardPayload: null,
        },
      })

      const askTx = result.transactions.find((candidate) => {
        if (candidate.inMessage?.info.type !== 'internal') return false
        if (!candidate.inMessage.info.src.equals(ctx.pool.address)) return false
        const body = candidate.inMessage.body.beginParse()
        return body.remainingBits >= 32 && body.preloadUint(32) === AskToTransfer.PREFIX
      })
      expect(askTx).toBeDefined()

      const ask = AskToTransfer.fromSlice(askTx!.inMessage!.body.beginParse())
      expect(ask.transferRecipient).toEqualAddress(ctx.deployer.address)
      expect(ask.jettonAmount).toBe(amount)
      expect(await ctx.pool.getIsInitialized()).toBe(false)
    })
  })
}

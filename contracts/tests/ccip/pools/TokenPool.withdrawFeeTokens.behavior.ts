import '@ton/test-utils'
import { SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, toNano } from '@ton/core'
import {
  AskToTransfer,
  JettonWithdrawable_Withdraw,
  JettonWithdrawable_WithdrawFeeTransfer,
  TokenPool,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { JettonWallet } from '../../../wrappers/examples/jetton'

// ———————————————————————————————————————————————————————————————————————————————
// WithdrawFeeTokens Behavior Tests
// Mirrors EVM TokenPool.withdrawFee.t.sol, transposed to TON where fees settle into
// the pool's own Jetton wallet. All pool families leave the transfer fee in the pool
// wallet on a successful lock (custody is burnt / forwarded elsewhere), so the
// withdraw mechanics below are identical across lock/release, burn/mint and the
// the lockbox pool. Each instance supplies `getWithdrawableFees` (the amount currently
// withdrawable as fees: the `accruedFees` ledger for lock/release, or the pool-wallet fee
// balance for the no-ledger burn/mint & lockbox families) and `doLock` (a successful
// fee-accruing lock where fee = amount*feeBps/BPS_DIVIDER).
// ———————————————————————————————————————————————————————————————————————————————

export type TokenPoolWithdrawFeeTokensBehaviorContext = {
  /// The pool under test, via the base `TokenPool` ABI (exposes the Withdraw message).
  pool: SandboxContract<TokenPool>
  deployer: SandboxContract<TreasuryContract>
  recipient: SandboxContract<TreasuryContract>
  unauthorized: SandboxContract<TreasuryContract>
  feeAdmin: SandboxContract<TreasuryContract>
  /// Reads the amount currently withdrawable as fees (ledger or wallet fee balance).
  getWithdrawableFees: () => Promise<bigint>
  /// The pool's own Jetton wallet (commingled: may hold user liquidity + fees).
  poolWallet: SandboxContract<JettonWallet>
  /// Resolves an account's Jetton wallet under the pool's token master.
  userWallet: (address: Address) => Promise<SandboxContract<JettonWallet>>
  /// The transfer fee (in bps) that accrues on each successful `doLock`.
  feeBps: bigint
  /// Performs a successful lock of `amount` jettons, accruing `fee = amount*feeBps/BPS_DIVIDER`.
  /// Returns the exact accrued fee so assertions don't recompute it.
  doLock: (amount: bigint, queryId: bigint) => Promise<{ feeAmount: bigint }>
}

export function runTokenPoolWithdrawFeeTokensBehaviorTests(
  name: string,
  setup: () => Promise<TokenPoolWithdrawFeeTokensBehaviorContext>,
) {
  describe(`${name} withdrawFeeTokens behavior`, () => {
    it('accrues fees on a successful lock (settles on success)', async () => {
      const ctx = await setup()
      const amount = toNano('10')
      const expectedFee = (amount * ctx.feeBps) / 10000n

      expect(await ctx.getWithdrawableFees()).toBe(0n)
      await ctx.doLock(amount, 101n)
      expect(await ctx.getWithdrawableFees()).toBe(expectedFee)
    })

    it('withdraws accrued fees as owner', async () => {
      const ctx = await setup()
      const amount = toNano('10')
      const { feeAmount } = await ctx.doLock(amount, 102n)
      expect(feeAmount).toBe((amount * ctx.feeBps) / 10000n)
      expect(await ctx.getWithdrawableFees()).toBe(feeAmount)

      // The pool holds amount jettons (locked custody + fee) in its own wallet.
      const poolBalanceBefore = await ctx.poolWallet.getJettonBalance()

      const withdrawMsg = JettonWithdrawable_Withdraw.create({
        queryId: 200n,
        transfers: [
          JettonWithdrawable_WithdrawFeeTransfer.create({
            wallet: ctx.poolWallet.address,
            // Enough to cover the relayed value + the pool reserve (0.2 + 0.1 <= 0.5 value sent).
            value: toNano('0.2'),
            msg: AskToTransfer.create({
              queryId: 200n,
              jettonAmount: feeAmount,
              transferRecipient: ctx.recipient.address,
              sendExcessesTo: ctx.pool.address,
              customPayload: null,
              forwardTonAmount: 0n,
              forwardPayload: beginCell().storeBit(0).endCell().beginParse(),
            }),
          }),
        ],
      })

      const result = await ctx.pool.sendJettonWithdrawableWithdraw(
        ctx.deployer.getSender(), // owner
        toNano('0.5'),
        withdrawMsg,
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.poolWallet.address,
        success: true,
        op: AskToTransfer.PREFIX,
      })

      // Only the fee left the wallet; the locked liquidity (destTokenAmount) remains.
      expect(await ctx.poolWallet.getJettonBalance()).toBe(poolBalanceBefore - feeAmount)
      // The recipient's wallet received the fee.
      expect(await (await ctx.userWallet(ctx.recipient.address)).getJettonBalance()).toBe(feeAmount)
      // Ledger cleared: nothing further is withdrawable.
      expect(await ctx.getWithdrawableFees()).toBe(0n)
    })

    it('withdraws accrued fees as feeAdmin', async () => {
      const ctx = await setup()
      const amount = toNano('5')
      const { feeAmount } = await ctx.doLock(amount, 103n)

      const poolBalanceBefore = await ctx.poolWallet.getJettonBalance()

      // Configure the fee admin in dynamic config (mirrors EVM `setDynamicConfig(feeAdmin)`).
      const setFeeAdmin = await ctx.pool.sendTokenPoolSetDynamicConfig(
        ctx.deployer.getSender(),
        toNano('0.2'),
        {
          queryId: 4n,
          router: ctx.deployer.address,
          rateLimitAdmin: null,
          feeAdmin: ctx.feeAdmin.address,
        },
      )
      expect(setFeeAdmin.transactions).toHaveTransaction({
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
      })

      const result = await ctx.pool.sendJettonWithdrawableWithdraw(
        ctx.feeAdmin.getSender(),
        toNano('0.5'),
        {
          queryId: 201n,
          transfers: [
            JettonWithdrawable_WithdrawFeeTransfer.create({
              wallet: ctx.poolWallet.address,
              // Enough to cover the relayed value + the pool reserve (0.2 + 0.1 <= 0.5 value sent).
              value: toNano('0.2'),
              msg: AskToTransfer.create({
                queryId: 201n,
                jettonAmount: feeAmount,
                transferRecipient: ctx.recipient.address,
                sendExcessesTo: ctx.pool.address,
                customPayload: null,
                forwardTonAmount: 0n,
                forwardPayload: beginCell().storeBit(0).endCell().beginParse(),
              }),
            }),
          ],
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.feeAdmin.address,
        to: ctx.pool.address,
        success: true,
      })
      expect(await ctx.poolWallet.getJettonBalance()).toBe(poolBalanceBefore - feeAmount)
      expect(await (await ctx.userWallet(ctx.recipient.address)).getJettonBalance()).toBe(feeAmount)
      expect(await ctx.getWithdrawableFees()).toBe(0n)
    })

    it('reverts when called by a non-owner/non-feeAdmin', async () => {
      const ctx = await setup()

      const result = await ctx.pool.sendJettonWithdrawableWithdraw(
        ctx.unauthorized.getSender(),
        toNano('0.5'),
        {
          queryId: 202n,
          transfers: [],
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.unauthorized.address,
        to: ctx.pool.address,
        success: false,
      })
    })
  })
}

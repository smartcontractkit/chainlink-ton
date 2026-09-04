import '@ton/test-utils'
import { findTransaction } from '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox'
import { Address, beginCell, toNano } from '@ton/core'
import {
  AskToTransfer,
  JettonWithdrawable_Withdraw,
  JettonWithdrawable_WithdrawFeeTransfer,
  TokenPool,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { JettonWallet } from '../../../wrappers/examples/jetton'
import { sendMessageAsync, captureAccountChanges } from '../../utils/sendInternalMessage'

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
  /// The sandbox blockchain (for raw messages + account balance snapshots).
  blockchain: Blockchain
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
  /// Whether the pool accepts a `Withdraw` with multiple transfers (default `true`).
  /// Lock/release bounds withdrawals by its single-token `accruedFees` ledger, so its hook
  /// rejects any withdrawal that isn't exactly one transfer to the pool's own wallet;
  /// the shared multi-transfer success test is skipped for such pools.
  allowsMultiTransfer?: boolean
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

    // Zero address: relaying to it would burn the jettons, so it is rejected
    // unconditionally (independent of any recipient allowlist).
    it('reverts when a transfer targets the zero address', async () => {
      const ctx = await setup()
      const ZERO_ADDRESS = Address.parse(
        '0:0000000000000000000000000000000000000000000000000000000000000000',
      )!

      const result = await ctx.pool.sendJettonWithdrawableWithdraw(
        ctx.deployer.getSender(), // owner
        toNano('0.5'),
        {
          queryId: 210n,
          transfers: [
            JettonWithdrawable_WithdrawFeeTransfer.create({
              wallet: ctx.poolWallet.address,
              value: toNano('0.2'),
              msg: AskToTransfer.create({
                queryId: 210n,
                jettonAmount: 1n,
                transferRecipient: ZERO_ADDRESS,
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
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    // Multi-transfer withdrawals: the base handler relays N transfers and enforces the
    // per-wallet cap cumulatively (so splitting one amount across several transfers to the
    // same wallet cannot evade a cap). Skipped for pools whose hook only accepts a single
    // transfer to the pool's own wallet (lock/release).
    it('relays multiple transfers in one withdrawal', async () => {
      const ctx = await setup()
      if (ctx.allowsMultiTransfer === false) return

      const amount = toNano('10')
      const { feeAmount } = await ctx.doLock(amount, 110n)
      expect(await ctx.getWithdrawableFees()).toBe(feeAmount)

      // Split the accrued fee across two transfers to the same wallet (each half below any
      // per-transfer cap, but together the full amount).
      const half = feeAmount / 2n
      expect(half * 2n).toBe(feeAmount)

      const result = await ctx.pool.sendJettonWithdrawableWithdraw(
        ctx.deployer.getSender(), // owner
        toNano('0.5'),
        {
          queryId: 220n,
          transfers: [0n, 1n].map((i) =>
            JettonWithdrawable_WithdrawFeeTransfer.create({
              wallet: ctx.poolWallet.address,
              value: toNano('0.2'),
              msg: AskToTransfer.create({
                queryId: 220n + i,
                jettonAmount: half,
                transferRecipient: ctx.recipient.address,
                sendExcessesTo: ctx.pool.address,
                customPayload: null,
                forwardTonAmount: 0n,
                forwardPayload: beginCell().storeBit(0).endCell().beginParse(),
              }),
            }),
          ),
        },
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
      // The recipient holds the full fee (the sum of both halves). If only one of the two
      // transfers were relayed it would hold just `half`, so this proves both executed.
      expect(await (await ctx.userWallet(ctx.recipient.address)).getJettonBalance()).toBe(feeAmount)
    })

    // The fee-withdrawal context must be carried in the `forwardPayload` (which TEP-74 wallets
    // forward as-is) while the caller's own `customPayload` and `forwardPayload` survive the relay
    // untouched — so standard and custom jetton wallets both see the caller's original payloads.
    it('relays the ask with the caller customPayload/forwardPayload untouched, tagged via a forwardPayload wrap', async () => {
      const ctx = await setup()
      const amount = toNano('10')
      const { feeAmount } = await ctx.doLock(amount, 120n)

      // Distinctive caller payloads: a customPayload cell and a binary (0xff-prefixed) forwardPayload.
      const callerCustomPayload = beginCell().storeUint(0xdeadbeef, 32).endCell()
      const callerForwardPayload = beginCell()
        .storeUint(0xff, 8)
        .storeUint(0x0042, 16)
        .endCell()
        .beginParse()

      const result = await ctx.pool.sendJettonWithdrawableWithdraw(
        ctx.deployer.getSender(), // owner
        toNano('0.5'),
        {
          queryId: 320n,
          transfers: [
            JettonWithdrawable_WithdrawFeeTransfer.create({
              wallet: ctx.poolWallet.address,
              value: toNano('0.2'),
              msg: AskToTransfer.create({
                queryId: 320n,
                jettonAmount: feeAmount,
                transferRecipient: ctx.recipient.address,
                sendExcessesTo: ctx.pool.address,
                customPayload: callerCustomPayload,
                forwardTonAmount: 0n,
                forwardPayload: callerForwardPayload,
              }),
            }),
          ],
        },
      )

      const relayed = findTransaction(result.transactions, {
        from: ctx.pool.address,
        to: ctx.poolWallet.address,
        op: AskToTransfer.PREFIX,
      })
      expect(relayed).toBeDefined()

      // Decode the ACTUAL relayed ask (the pool rewrites it before forwarding to the wallet).
      const relayIn = relayed!.inMessage
      if (!relayIn || 'bouncedBody' in relayIn) {
        throw new Error('Relayed AskToTransfer in-message not found')
      }
      const ask = AskToTransfer.fromSlice(relayIn.body!.beginParse())

      // (1) customPayload passes through untouched.
      expect(ask.customPayload).not.toBeNull()
      expect(ask.customPayload!.equals(callerCustomPayload)).toBe(true)

      // (2) forwardPayload is a ref-wrapped Jetton_ForwardPayloadWrap carrying the withdrawal
      //     context, with the caller's original forwardPayload preserved as its remainder.
      const fp = ask.forwardPayload
      expect(fp.loadBit()).toBe(true) // Either ^Cell variant
      const wrap = fp.loadRef().beginParse()
      expect(wrap.loadUint(32)).toBe(0x2d61600c) // Jetton_ForwardPayloadWrap opcode
      expect(wrap.loadAddress().equals(ctx.deployer.address)).toBe(true) // initiator
      expect(wrap.loadBit()).toBe(true) // context cell present
      const context = wrap.loadRef().beginParse()
      expect(context.loadUint(32)).toBe(0x943e281e) // JettonWithdrawable_WITHDRAW_OPCODE
      expect(context.loadAddress().equals(ctx.deployer.address)).toBe(true) // withdrawInitiator

      // The wrap remainder must be byte-identical to the caller's original forwardPayload.
      const remainderCell = beginCell().storeSlice(wrap).endCell()
      const expectedRemainder = beginCell().storeSlice(callerForwardPayload).endCell()
      expect(remainderCell.equals(expectedRemainder)).toBe(true)

      // End-to-end still works: the fee reached the recipient.
      expect(await (await ctx.userWallet(ctx.recipient.address)).getJettonBalance()).toBe(feeAmount)
    })

    // A bounced fee-withdraw ask (wallet rejects the amount) is recognized via its forwardPayload
    // context and reported to the withdrawal initiator (the owner/fee-admin that called withdraw).
    it('notifies the withdrawal initiator when the fee-withdraw ask bounces', async () => {
      const ctx = await setup()
      // Ledger-bounded pools (lock/release) cap withdrawals at the accrued-fee ledger, which can
      // never exceed the wallet's physical balance, so a bounce cannot be forced there.
      if (ctx.allowsMultiTransfer === false) return

      // A prior lock deploys the pool wallet (the wallet is lazily deployed on first use).
      await ctx.doLock(toNano('1'), 130n)

      // Request more jettons than the pool wallet physically holds → the real jetton wallet
      // bounces the AskToTransfer back to the pool.
      const walletBalance = await ctx.poolWallet.getJettonBalance()
      const overAmount = walletBalance + toNano('100')

      const result = await ctx.pool.sendJettonWithdrawableWithdraw(
        ctx.deployer.getSender(), // owner
        toNano('0.5'),
        {
          queryId: 400n,
          transfers: [
            JettonWithdrawable_WithdrawFeeTransfer.create({
              wallet: ctx.poolWallet.address,
              value: toNano('0.2'),
              msg: AskToTransfer.create({
                queryId: 400n,
                jettonAmount: overAmount,
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

      // The pool relayed the ask and the wallet bounced it back; the pool handled the bounce.
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.poolWallet.address,
        op: AskToTransfer.PREFIX,
      })
      expect(result.transactions).toHaveTransaction({
        to: ctx.pool.address,
        inMessageBounced: true,
        success: true,
      })

      // JettonWithdrawable_WithdrawFailed { wallet, ask } is sent to the initiator (deployer),
      // echoing the bounced ask (queryId 400) and the wallet it was sent to.
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        success: true,
        body(body) {
          if (!body) return false
          const s = body.beginParse()
          const wallet = s.loadAddress()
          const ask = AskToTransfer.fromSlice(s)
          return wallet.equals(ctx.poolWallet.address) && ask.queryId === 400n
        },
      })
    })

    // The up-front reserveToncoinsOnBalance(originalBalance + rent) means every relay value and
    // emitted event must be paid by the INBOUND value alone; the pool's custodial GRAM stays
    // untouched. Proven by asserting the pool's balance never drops below its pre-message value.
    it('never draws down the pool balance: inbound value funds relays and emits', async () => {
      const ctx = await setup()
      if (ctx.allowsMultiTransfer === false) return

      const amount = toNano('10')
      const { feeAmount } = await ctx.doLock(amount, 300n)
      expect(await ctx.getWithdrawableFees()).toBe(feeAmount)

      const poolAccount = await ctx.blockchain.getContract(ctx.pool.address)
      const poolBalanceBefore = poolAccount.balance

      const half = feeAmount / 2n
      expect(half * 2n).toBe(feeAmount)

      // Each relay carries 0.2 TON so its own forward fee is paid from the relay value
      // (SEND_MODE_REGULAR); the 0.5 TON inbound funds both relays + the in-message fee +
      // compute gas + the emitted events. The up-front reserve floors the balance at
      // (original balance + rent cushion) before any of that, so the relays and emits can
      // only draw on the caller's value — never the pool's custodial GRAM.
      const inboundValue = toNano('0.5')
      const relayValue = toNano('0.2')
      const body = TokenPool.createCellOfJettonWithdrawableWithdraw({
        queryId: 310n,
        transfers: [0n, 1n].map((i) =>
          JettonWithdrawable_WithdrawFeeTransfer.create({
            wallet: ctx.poolWallet.address,
            value: relayValue,
            msg: AskToTransfer.create({
              queryId: 310n + i,
              jettonAmount: half,
              transferRecipient: ctx.recipient.address,
              sendExcessesTo: ctx.pool.address,
              customPayload: null,
              forwardTonAmount: 0n,
              forwardPayload: beginCell().storeBit(0).endCell().beginParse(),
            }),
          }),
        ),
      })

      const txs = await sendMessageAsync(ctx.blockchain, ctx.deployer.address, {
        to: ctx.pool.address,
        value: inboundValue,
        body,
      })
      const { transactions, accountSnapshots } = await captureAccountChanges(ctx.blockchain, txs, [
        ctx.pool.address,
      ])

      // Happy path end-to-end: both relayed asks executed, recipient holds the full fee.
      const withdrawTX = findTransaction(transactions, {
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: true,
        op: JettonWithdrawable_Withdraw.PREFIX,
      })
      expect(withdrawTX).toBeDefined()
      expect(await (await ctx.userWallet(ctx.recipient.address)).getJettonBalance()).toBe(feeAmount)
      expect(await ctx.getWithdrawableFees()).toBe(0n)

      // The pre-existing custodial GRAM must never be drawn down by the relays or emits. The
      // up-front reserve floors the balance at (original balance + rent cushion), so the pool's
      // balance may only stay the same or grow (the leftover of the caller's value). A regression
      // that lets an emit/relay spend from the custodial balance would drop it below `before`.
      if (!withdrawTX) throw new Error('Withdraw transaction not found')
      const snap = accountSnapshots.get(withdrawTX.lt)
      if (!snap) throw new Error('Pool snapshot missing for Withdraw tx')
      expect(snap.before.balance).toBe(poolBalanceBefore)
      expect(snap.after.balance).toBeGreaterThanOrEqual(poolBalanceBefore)
    })
  })
}

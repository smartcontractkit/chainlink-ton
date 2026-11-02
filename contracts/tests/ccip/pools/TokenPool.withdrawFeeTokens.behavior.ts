import '@ton/test-utils'
import { findTransaction } from '@ton/test-utils'
import { Blockchain, SandboxContract, TreasuryContract, internal } from '@ton/sandbox'
import { Address, beginCell, toNano } from '@ton/core'
import {
  AskToTransfer,
  JettonWithdrawable_Withdraw,
  JettonWithdrawable_WithdrawFeeTransfer,
  TokenPool,
} from '../../../wrappers/gen/ccip/pools/TokenPool'
import { JettonMinter, JettonWallet } from '../../../wrappers/examples/jetton'
import { contractCode } from '../../../wrappers/codeLoader'
import * as da from '../../../wrappers/gen/ccip/DepositAccount'
import { sendMessageAsync, captureAccountChanges } from '../../utils/sendInternalMessage'

// ———————————————————————————————————————————————————————————————————————————————
// WithdrawFeeTokens Behavior Tests
// Mirrors EVM TokenPool.withdrawFee.t.sol, transposed to TON where fees settle into
// the pool's own Jetton wallet. All pool families leave the transfer fee in the pool
// wallet on a successful lock (custody is burnt / forwarded elsewhere), so the
// withdraw mechanics below are identical across lock/release and burn/mint. Each instance
// supplies `getWithdrawableFees` (the pool's `accruedFees` ledger) and `doLock` (a
// successful fee-accruing lock where fee = amount*feeBps/BPS_DIVIDER).
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
  /// Reads the amount currently withdrawable from the pool's own token (the `accruedFees` ledger).
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

    it('owner can rescue fees with the explicit opcode', async () => {
      const ctx = await setup()
      const amount = toNano('10')
      const { feeAmount } = await ctx.doLock(amount, 107n)
      expect(await ctx.getWithdrawableFees()).toBe(feeAmount)

      const result = await ctx.pool.sendTokenPoolWithdrawRescue(
        ctx.deployer.getSender(), // owner
        toNano('0.5'),
        {
          withdrawMsg: JettonWithdrawable_Withdraw.create({
            queryId: 207n,
            transfers: [
              JettonWithdrawable_WithdrawFeeTransfer.create({
                wallet: ctx.poolWallet.address,
                value: toNano('0.2'),
                msg: AskToTransfer.create({
                  queryId: 207n,
                  jettonAmount: feeAmount,
                  transferRecipient: ctx.recipient.address,
                  sendExcessesTo: ctx.pool.address,
                  customPayload: null,
                  forwardTonAmount: 0n,
                  forwardPayload: beginCell().storeBit(0).endCell().beginParse(),
                }),
              }),
            ],
          }),
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.poolWallet.address,
        success: true,
        op: AskToTransfer.PREFIX,
      })
      expect(await (await ctx.userWallet(ctx.recipient.address)).getJettonBalance()).toBe(feeAmount)
      expect(await ctx.getWithdrawableFees()).toBe(0n)
    })

    it('rejects rescue from a non-owner', async () => {
      const ctx = await setup()

      const setFeeAdmin = await ctx.pool.sendTokenPoolSetDynamicConfig(
        ctx.deployer.getSender(),
        toNano('0.2'),
        {
          queryId: 5n,
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

      const result = await ctx.pool.sendTokenPoolWithdrawRescue(
        ctx.feeAdmin.getSender(),
        toNano('0.5'),
        {
          withdrawMsg: JettonWithdrawable_Withdraw.create({ queryId: 208n, transfers: [] }),
        },
      )

      expect(result.transactions).toHaveTransaction({
        from: ctx.feeAdmin.address,
        to: ctx.pool.address,
        success: false,
      })
    })

    it('rejects a withdrawal above the accrued-fee ledger', async () => {
      const ctx = await setup()
      const amount = toNano('10')
      const { feeAmount } = await ctx.doLock(amount, 104n)
      expect(await ctx.getWithdrawableFees()).toBe(feeAmount)

      const poolBalanceBefore = await ctx.poolWallet.getJettonBalance()

      // The ledger caps withdrawals at `feeAmount`; custody retained in the wallet must not be
      // sweepable even though it is physically present (D-04).
      const result = await ctx.pool.sendJettonWithdrawableWithdraw(
        ctx.deployer.getSender(), // owner
        toNano('0.5'),
        {
          queryId: 203n,
          transfers: [
            JettonWithdrawable_WithdrawFeeTransfer.create({
              wallet: ctx.poolWallet.address,
              value: toNano('0.2'),
              msg: AskToTransfer.create({
                queryId: 203n,
                jettonAmount: feeAmount * 2n,
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
        from: ctx.deployer.address,
        to: ctx.pool.address,
        success: false,
        exitCode: 55702, // JettonWithdrawable_Error.MaxAmountExceeded
      })
      expect(await ctx.poolWallet.getJettonBalance()).toBe(poolBalanceBefore)
      expect(await ctx.getWithdrawableFees()).toBe(feeAmount)
    })

    it('withdraws foreign jettons accidentally sent to the pool', async () => {
      const ctx = await setup()
      const amount = toNano('10')
      const { feeAmount } = await ctx.doLock(amount, 105n)
      expect(await ctx.getWithdrawableFees()).toBe(feeAmount)

      // Deploy a second Jetton and mint directly to the pool address. The pool becomes the owner
      // of that token's wallet, exactly like an accidental transfer.
      const foreignWalletCode = await contractCode.jetton('JettonWallet')
      const foreignMinter = ctx.blockchain.openContract(
        JettonMinter.createFromConfig(
          {
            admin: ctx.deployer.address,
            transferAdmin: null,
            walletCode: foreignWalletCode,
            jettonContent: beginCell().storeStringTail('foreign').endCell(),
            totalSupply: 0n,
          },
          await contractCode.jetton('JettonMinter'),
        ),
      )
      await foreignMinter.sendDeploy(ctx.deployer.getSender(), toNano('1'))

      const foreignAmount = toNano('5')
      await foreignMinter.sendMint(ctx.deployer.getSender(), {
        value: toNano('1'),
        message: {
          queryId: 500n,
          destination: ctx.pool.address,
          tonAmount: toNano('0.05'),
          jettonAmount: foreignAmount,
          from: ctx.deployer.address,
          responseDestination: ctx.deployer.address,
          forwardTonAmount: 0n,
        },
      })

      const poolForeignWallet = ctx.blockchain.openContract(
        JettonWallet.createFromAddress(await foreignMinter.getWalletAddress(ctx.pool.address)),
      )
      expect(await poolForeignWallet.getJettonBalance()).toBe(foreignAmount)
      const recipientForeignWallet = ctx.blockchain.openContract(
        JettonWallet.createFromAddress(await foreignMinter.getWalletAddress(ctx.recipient.address)),
      )

      const result = await ctx.pool.sendJettonWithdrawableWithdraw(
        ctx.deployer.getSender(), // owner
        toNano('0.5'),
        {
          queryId: 205n,
          transfers: [
            JettonWithdrawable_WithdrawFeeTransfer.create({
              wallet: ctx.poolWallet.address,
              value: toNano('0.2'),
              msg: AskToTransfer.create({
                queryId: 205n,
                jettonAmount: feeAmount,
                transferRecipient: ctx.recipient.address,
                sendExcessesTo: ctx.pool.address,
                customPayload: null,
                forwardTonAmount: 0n,
                forwardPayload: beginCell().storeBit(0).endCell().beginParse(),
              }),
            }),
            JettonWithdrawable_WithdrawFeeTransfer.create({
              wallet: poolForeignWallet.address,
              value: toNano('0.2'),
              msg: AskToTransfer.create({
                queryId: 206n,
                jettonAmount: foreignAmount,
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
        from: ctx.pool.address,
        to: ctx.poolWallet.address,
        success: true,
        op: AskToTransfer.PREFIX,
      })
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: poolForeignWallet.address,
        success: true,
        op: AskToTransfer.PREFIX,
      })
      expect(await (await ctx.userWallet(ctx.recipient.address)).getJettonBalance()).toBe(feeAmount)
      expect(await recipientForeignWallet.getJettonBalance()).toBe(foreignAmount)
      // Only the pool's own token is ledgered.
      expect(await ctx.getWithdrawableFees()).toBe(0n)
    })

    it('does not re-credit accruedFees when a fee-withdraw ask bounces', async () => {
      const ctx = await setup()
      await ctx.doLock(toNano('1'), 106n)
      const before = await ctx.getWithdrawableFees()
      const bouncedAmount = 123n

      const ask = AskToTransfer.create({
        queryId: 400n,
        jettonAmount: bouncedAmount,
        transferRecipient: ctx.recipient.address,
        sendExcessesTo: ctx.pool.address,
        customPayload: null,
        forwardTonAmount: 0n,
        forwardPayload: beginCell()
          .storeMaybeRef(
            da.Jetton_ForwardPayloadWrap.toCell(
              da.Jetton_ForwardPayloadWrap.create({
                initiator: ctx.deployer.address,
                context: beginCell().storeUint(0x0196a077, 32).endCell(), // JettonWithdrawable_WithdrawContext
                forwardPayload: beginCell().storeBit(false).endCell(),
              }),
            ),
          )
          .endCell()
          .beginParse(),
      })
      const originalBody = AskToTransfer.toCell(ask)
      const originalInfo = beginCell()
        .storeCoins(toNano('0.01'))
        .storeDict(null)
        .storeUint(0, 64)
        .storeUint(0, 32)
        .endCell()
      const body = beginCell()
        .storeUint(0xfffffffe, 32)
        .storeRef(originalBody)
        .storeRef(originalInfo)
        .storeUint(1, 8)
        .storeInt(0, 32)
        .storeBit(false)
        .endCell()

      const result = await ctx.blockchain.sendMessage(
        internal({
          from: ctx.poolWallet.address,
          to: ctx.pool.address,
          value: toNano('0.05'),
          bounced: true,
          body,
        }),
      )

      expect(result.transactions).toHaveTransaction({
        to: ctx.pool.address,
        inMessageBounced: true,
        success: true,
      })
      // The initiator is notified with the bounced ask.
      expect(result.transactions).toHaveTransaction({
        from: ctx.pool.address,
        to: ctx.deployer.address,
        success: true,
        body(body) {
          if (!body) return false
          const s = body.beginParse()
          const wallet = s.loadAddress()
          const bouncedAsk = AskToTransfer.fromSlice(s)
          return wallet.equals(ctx.poolWallet.address) && bouncedAsk.queryId === 400n
        },
      })
      // The returned jettons are rescued explicitly; the ledger must not be inflated.
      expect(await ctx.getWithdrawableFees()).toBe(before)
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
    // same wallet cannot evade a cap).
    it('relays multiple transfers in one withdrawal', async () => {
      const ctx = await setup()

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

      // Distinctive caller payloads: a customPayload cell and a ref forwardPayload.
      const callerCustomPayload = beginCell().storeUint(0xdeadbeef, 32).endCell()
      const callerForwardPayloadCell = beginCell()
        .storeUint(0xff, 8)
        .storeUint(0x0042, 16)
        .endCell()
      const callerForwardPayload = beginCell().storeMaybeRef(callerForwardPayloadCell).asSlice()

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
      //     context, with the caller's original forwardPayload preserved.
      const fp = ask.forwardPayload
      expect(fp.loadBit()).toBe(true) // Either ^Cell variant
      const wrap = fp.loadRef().beginParse()
      expect(wrap.loadUint(32)).toBe(0x2d61600c) // Jetton_ForwardPayloadWrap opcode
      expect(wrap.loadAddress().equals(ctx.deployer.address)).toBe(true) // initiator
      expect(wrap.loadBit()).toBe(true) // context cell present
      // Context is the opcode tag only; the failure-report destination lives on the wrap's `initiator`.
      const contextCell = wrap.loadRef()
      expect(contextCell.equals(beginCell().storeUint(0x0196a077, 32).endCell())).toBe(true) // JettonWithdrawable_WITHDRAW_OPCODE

      expect(wrap.loadMaybeRef()?.equals(callerForwardPayloadCell)).toBe(true)

      // End-to-end still works: the fee reached the recipient.
      expect(await (await ctx.userWallet(ctx.recipient.address)).getJettonBalance()).toBe(feeAmount)
    })

    it('never draws down the pool balance: inbound value funds relays and emits', async () => {
      const ctx = await setup()

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

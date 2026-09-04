// SPDX-License-Identifier: MIT
tolk 1.4.1

import "@stdlib/gas-payments"
import "../jetton/forward_payload_wrap"
import "../jetton/messages"
import "../utils"

const JettonWithdrawable_FACILITY_NAME = "link.chain.ton.lib.funding.JettonWithdrawable";
const JettonWithdrawable_FACILITY_ID = JettonWithdrawable_FACILITY_NAME.crc32() % 640 + 10;  // 557

const TOPIC_FEE_TOKEN_WITHDRAWN = "FeeTokenWithdrawn".crc32();

// Rent cushion reserved on withdraw
const JettonWithdrawable_MIN_RESERVE = ton("0.01");

struct JettonWithdrawable {}

enum JettonWithdrawable_Error {
    // Cannot withdraw fees to the zero address (would burn the jettons).
    ZeroAddressNotAllowed =  JettonWithdrawable_FACILITY_ID * 100;
    // A transfer does not target the configured allowed recipient.
    UnallowedRecipient;
    // The cumulative `jettonAmount` relayed to a wallet exceeds its per-wallet `maxAmount` cap.
    MaxAmountExceeded;
}

/// A fee-withdrawal transfer: a destination wallet, value, and the `AskToTransfer` msg to relay.
struct JettonWithdrawable_WithdrawFeeTransfer {
    /// The Jetton wallet owning the fees that the `AskToTransfer` is sent to.
    wallet: address;
    /// TON value forwarded with the relay, paying the wallet's compute + forward fees (deducted via
    /// `SEND_MODE_REGULAR`). Caller allocates per transfer; the relays spend from the balance above
    /// the reserved pre-existing balance, funded by the inbound `msgValue`.
    value: coins;
    /// The transfer to relay. `transferRecipient` is where the jettons end up.
    msg: AskToTransfer;
}

/// Requests withdrawal of accrued fee jettons. The caller (a contract holding Jetton wallets)
/// builds the exact `wallet` + `AskToTransfer` pairs to relay.
struct (0x0d00995c) JettonWithdrawable_Withdraw {
    queryId: uint64;
    transfers: array<JettonWithdrawable_WithdrawFeeTransfer>;
}

/// Relayed to the recipient of a fee withdrawal for observability.
/// @dev References the source Jetton wallet (not a token master), matching TON's minter/wallet
///      architecture: a wallet uniquely identifies owner + token.
struct JettonWithdrawable_FeeTokenWithdrawn {
    wallet: address;
    amount: coins;
}

/// Opcode identifying a `JettonWithdrawable_WithdrawContext` inside a
/// `Jetton_ForwardPayloadWrap.context` cell, distinguishing fee withdrawals from other asks.
const JettonWithdrawable_WITHDRAW_OPCODE = "JettonWithdrawableWithdraw".crc32();

/// Tag on a relayed fee-withdrawal `AskToTransfer` so a bounce knows it is a fee withdrawal.
/// Stored as the `context` of a `Jetton_ForwardPayloadWrap`;
struct JettonWithdrawable_WithdrawContext {
    opcode: uint32;
}

/// Failure reported to a withdrawal initiator when their fee-withdraw `AskToTransfer` bounced.
struct JettonWithdrawable_WithdrawFailed {
    /// The jetton wallet the failed withdrawal was sent to.
    wallet: address;
    ask: AskToTransfer;
}

/// Parses the `Jetton_ForwardPayloadWrap` from a (possibly bounced) fee-withdrawal
/// `AskToTransfer`, or `null` if the ask isn't a fee withdrawal.
@inline
fun JettonWithdrawable.parseWithdrawWrap(ask: AskToTransfer): Jetton_ForwardPayloadWrap? {
    val wrap = Jetton_ForwardPayloadWrap.from(ask.forwardPayload);
    if (wrap == null || wrap!.context == null) {
        return null;
    }

    val opcode = wrap!.context!.beginParse().loadUint(32);
    if (opcode != JettonWithdrawable_WITHDRAW_OPCODE) {
        return null;
    }

    return wrap;
}

/// Withdraws accrued fee jettons by relaying the provided transfers to the given wallets.
/// @dev The caller enforces its own access control (owner/fee-admin) *before* invoking this;
///      the handler enforces the per-transfer allowlist, per-wallet cap, and value invariants.
/// @param msgValue Inbound TON value; must cover the pool's rent reserve on top of its full
///        pre-existing balance (validated by the up-front `reserveToncoinsOnBalance`), which in
///        turn must also fund every relayed transfer value and emitted event.
/// @param sender The caller; retained for attribution/observability.
/// @param msg The withdrawal request (wallet + transfer pairs, each with its own `value`).
/// @param maxAmount Per-wallet upper bound on the cumulative `jettonAmount` relayed to each wallet
///        (throws `MaxAmountExceeded` when a wallet's running total exceeds its entry). A wallet
///        with no entry is treated as unbounded, so callers with commingled wallets (physical
///        balance exceeding the ledgered fee balance) MUST include an entry for every such wallet.
///        `null` means unbounded for all wallets.
/// @param allowedRecipients Optional permit list of withdrawal destinations. When set, every
///        `ask.transferRecipient` must be in this list, so funds can only be swept to allowlisted fee
///        aggregators. When `null`, any non-zero recipient is allowed (the zero address would burn).
/// @return withdrawnPerWallet Per-wallet total jetton amount relayed, for caller bookkeeping
///        (e.g. decrementing a per-wallet fee ledger on success / re-crediting on bounce).
fun JettonWithdrawable.onWithdraw(
    msgValue: coins,
    sender: address,
    msg: JettonWithdrawable_Withdraw,
    maxAmount: map<address, coins>?,
    allowedRecipients: array<address>?,
): map<address, coins> {
    // Reserve TON to cover the original balance plus rent due and some cushion.
    reserveToncoinsOnBalance(
        JettonWithdrawable_MIN_RESERVE + contract.getStorageDuePayment(),
        RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL
    );

    // Per-wallet running sum of relayed jetton amounts; checked against `maxAmount` per wallet.
    var withdrawnPerWallet: map<address, coins> = [];
    var iter: ArrayIterator<JettonWithdrawable_WithdrawFeeTransfer> = ArrayIterator<JettonWithdrawable_WithdrawFeeTransfer>.new(msg.transfers);
    while (!iter.empty()) {
        val transfer = iter.next();
        val ask = transfer.msg;

        // Never burn: disallow relaying to the zero address regardless of the allowlist.
        assert(!isZeroAddress(ask.transferRecipient), JettonWithdrawable_Error.ZeroAddressNotAllowed);
        // With an allowlist configured, every transfer must land on one of its recipients.
        if (allowedRecipients != null
            && !JettonWithdrawable.isAllowedRecipient(ask.transferRecipient, allowedRecipients!)) {
            throw JettonWithdrawable_Error.UnallowedRecipient;
        }

        // Accumulate the per-wallet total; if a cap is set for this wallet, the cumulative amount
        // (this transfer + any earlier ones to the same wallet) must stay within it.
        var prior: coins = 0;
        val existing = withdrawnPerWallet.get(transfer.wallet);
        if (existing.isFound) {
            prior = existing.loadValue();
        }
        val cumulative: coins = prior + ask.jettonAmount;
        if (maxAmount != null) {
            val cap = maxAmount!.get(transfer.wallet);
            if (cap.isFound) {
                assert(cumulative <= cap.loadValue(), JettonWithdrawable_Error.MaxAmountExceeded);
            }
        }
        withdrawnPerWallet.set(transfer.wallet, cumulative);

        // Tag the withdrawal context in the `forwardPayload` wrap
        val wrap = Jetton_ForwardPayloadWrap {
            initiator: sender,
            context: JettonWithdrawable_WithdrawContext {
                opcode: JettonWithdrawable_WITHDRAW_OPCODE,
            }.toCell(),
            forwardPayload: ask.forwardPayload,
        };

        val taggedAsk = AskToTransfer {
            queryId: ask.queryId,
            jettonAmount: ask.jettonAmount,
            transferRecipient: ask.transferRecipient,
            sendExcessesTo: ask.sendExcessesTo,
            customPayload: ask.customPayload,
            forwardTonAmount: ask.forwardTonAmount,
            forwardPayload: wrap.asForwardPayload(),
        };

        // Relay with the caller's value; rich bounce returns the tagged ask on failure.
        val relay = createMessage({
            bounce: BounceMode.RichBounce,
            value: transfer.value,
            dest: transfer.wallet,
            body: taggedAsk.toCell(),
        });
        relay.send(SEND_MODE_REGULAR | SEND_MODE_BOUNCE_ON_ACTION_FAIL);

        emit(TOPIC_FEE_TOKEN_WITHDRAWN, JettonWithdrawable_FeeTokenWithdrawn {
            wallet: transfer.wallet,
            amount: ask.jettonAmount,
        });
    }

    return withdrawnPerWallet;
}

/// Whether `recipient` is one of the allowlisted withdrawal destinations.
@inline
fun JettonWithdrawable.isAllowedRecipient(recipient: address, allowed: array<address>): bool {
    var iter = ArrayIterator<address>.new(allowed);
    while (!iter.empty()) {
        if (iter.next() == recipient) {
            return true;
        }
    }
    return false;
}

/// Default handler for a bounced fee-withdrawal `AskToTransfer`: notifies the wrap's `initiator`
/// of the failure. The caller (a pool's `onBouncedMessage`) validates authorization first
/// (e.g. bounce from own wallet).
/// @dev Returns false when the ask isn't a recognized fee withdrawal
fun JettonWithdrawable.onWithdrawBounced(
    wallet: address,
    ask: AskToTransfer,
): bool {
    val wrap = JettonWithdrawable.parseWithdrawWrap(ask);
    if (wrap == null) {
        return false;
    }

    val failure = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: wrap!.initiator,
        body: JettonWithdrawable_WithdrawFailed { wallet, ask },
    });
    failure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);

    return true;
}

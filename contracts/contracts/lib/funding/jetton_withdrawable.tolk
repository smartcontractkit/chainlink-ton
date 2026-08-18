// SPDX-License-Identifier: MIT
tolk 1.4.1

import "../jetton/messages"
import "../utils"

const JettonWithdrawable_FACILITY_NAME = "link.chain.ton.lib.funding.JettonWithdrawable";
const JettonWithdrawable_FACILITY_ID = JettonWithdrawable_FACILITY_NAME.crc32() % 640 + 10;  // 545
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions
const JettonWithdrawable_ERROR_CODE = JettonWithdrawable_FACILITY_ID * 100;

const TOPIC_FEE_TOKEN_WITHDRAWN = "FeeTokenWithdrawn".crc32();

/// The pool's own gas/storage reserve that the inbound withdrawal value must exceed on top of the
/// sum of the relayed transfer values. Each transfer carries its own `value` (used to pay the
/// wallet's compute + forwarding, with fees deducted via `SEND_MODE_REGULAR`), so this only
/// guarantees the caller funds the pool's own costs rather than drawing on pool custody.
const JettonWithdrawable_MIN_RESERVE = ton("0.1");

/// Mirrors EVM `FeeTokenHandler.WithdrawFeeTokens`: transfers accrued fee jetton balances to
/// the provided recipient. Unlike EVM there is no synchronous `balanceOf(pool)` and the pool's
/// Jetton wallet can hold user liquidity too (`lock/release`), so the caller supplies the exact
/// transfers to relay and caps them with `maxAmount` (e.g. an accrued-fee ledger).
struct JettonWithdrawable {}

enum JettonWithdrawable_Error {
    // Cannot withdraw fees to the zero/none address.
    ZeroAddressNotAllowed = JettonWithdrawable_ERROR_CODE;
    // A transfer does not target the configured allowed recipient.
    UnallowedRecipient;
    // Trying to withdraw more than the caller-allowed maxAmount.
    MaxAmountExceeded;
    // The inbound message value is insufficient to cover all relayed transfer values + reserve.
    InsufficientValue;
    // The request must carry exactly one transfer targeting a single, allowed wallet.
    InvalidWithdrawWallet;
}

/// One concrete fee-withdrawal step: which wallet to relay an `AskToTransfer` to.
/// The wallet is explicit because, unlike a single pool token, the caller may hold fees across
/// multiple tokens/wallets and the destination wallet must be carried on the message (there is
/// no generic `balanceOf` synchronous read on TON to derive it).
struct JettonWithdrawable_WithdrawFeeTransfer {
    /// The Jetton wallet that owns the accrued fee jettons and that the `AskToTransfer` is sent to.
    wallet: address;
    /// The TON value forwarded with the relayed `AskToTransfer`, paying the wallet's compute +
    /// forward (fees are deducted from it via `SEND_MODE_REGULAR`). Carried on the input so the
    /// caller decides how much to allocate per transfer; pooled, `msgValue` must cover the sum of
    /// these values plus `JettonWithdrawable_MIN_RESERVE`.
    value: coins;
    /// The concrete transfer to relay. `transferRecipient` is where the jettons end up.
    msg: AskToTransfer;
}

/// Requests withdrawal of accrued fee jettons.
/// The caller (a contract holding Jetton wallets) builds the exact transfers to relay.
/// Each carries its own `AskToTransfer` (including its recipient) plus the source wallet.
struct (0x0E0718C3) JettonWithdrawable_Withdraw {
    queryId: uint64;
    /// Concrete wallet + transfer pairs to relay.
    transfers: array<JettonWithdrawable_WithdrawFeeTransfer>;
}

/// Relayed to the recipient of a fee withdrawal for observability.
/// @dev References the source Jetton wallet, not a token master, matching TON's
///      minter/wallet architecture (a wallet uniquely identifies owner + token).
struct JettonWithdrawable_FeeTokenWithdrawn {
    wallet: address;
    amount: coins;
}

/// Opcode embedded in the fee-withdrawal `WithdrawContext` so a bounced `AskToTransfer` can be
/// recognized as a fee withdrawal (vs. any other `AskToTransfer` a pool sends, e.g. release asks
/// which keep `customPayload` empty).
const JettonWithdrawable_WITHDRAW_OPCODE = "JettonWithdrawableWithdraw".crc32();

/// Correlated with each relayed fee-withdrawal `AskToTransfer` so a bounce knows (1) that this is
/// a fee withdrawal and (2) who requested it (to report the failure to).
/// @dev Stored in `AskToTransfer.customPayload` (which we require to be empty), mirroring the
///      `customPayload`-as-bounce-marker pattern already used by burn/mint and the JettonLockBox.
struct JettonWithdrawable_WithdrawContext {
    opcode: uint32;
    /// The `sender` that initiated the withdrawal, so a bounce can be reported back to it.
    withdrawInitiator: address;
}

/// Failure reported to a withdrawal initiator when their fee-withdraw `AskToTransfer` bounced.
struct JettonWithdrawable_WithdrawFailed {
    /// The jetton wallet the failed withdrawal was sent to.
    wallet: address;
    ask: AskToTransfer;
}

/// Parses the fee-withdrawal context out of a (possibly bounced) `AskToTransfer`.
/// Returns `null` when the ask is not a fee-withdrawal (no `customPayload` or a non-matching opcode).
@inline
fun JettonWithdrawable.parseWithdrawContext(ask: AskToTransfer): JettonWithdrawable_WithdrawContext? {
    if (ask.customPayload == null) {
        return null;
    }

    var cs = ask.customPayload!.beginParse();
    val opcode = cs.loadUint(32);
    if (opcode != JettonWithdrawable_WITHDRAW_OPCODE) {
        return null;
    }

    return JettonWithdrawable_WithdrawContext {
        opcode: opcode as uint32,
        withdrawInitiator: cs.loadAddress(),
    };
}

/// Withdraws accrued fee jettons by relaying the provided transfers to the given wallets.
/// @dev The caller is expected to enforce its own access control (e.g. owner/fee-admin) *before*
///      invoking this handler; the handler only enforces the per-transfer allowlist, limit and
///      value-coverage invariants. Mirrors EVM `FeeTokenHandler._withdrawFeeTokens` minus its
///      caller gating.
/// @param msgValue The TON value carried by the inbound withdrawal message. Must cover the sum of
///        all relayed transfer values plus `JettonWithdrawable_MIN_RESERVE`.
/// @param sender The caller; retained for attribution/observability.
/// @param msg The withdrawal request (wallet + transfer pairs, each with its own `value`).
/// @param maxAmount The upper bound per transfer; clients use their accrued-fee ledger
///        (or MAX for full-balance sweeps).
/// @param allowedRecipients Optional permit list of withdrawal destinations. When set, every
///        `AskToTransfer` in `msg.transfers` must have its `transferRecipient` in this list, so
///        funds can only ever be swept to allowlisted fee aggregators. When `null`, any recipient
///        is allowed except the zero/none address (which would burn the jettons).
/// @return totalWithdrawn The total jetton amount relayed
fun JettonWithdrawable.onWithdraw(
    msgValue: coins,
    sender: address,
    msg: JettonWithdrawable_Withdraw,
    maxAmount: coins,
    allowedRecipients: array<address>?,
): coins {
    // Single pass: enforce the value-coverage guard and fulfil each relay. `totalValue` is the
    // running sum of relayed TON values; the inbound `msgValue` must cover it + the pool reserve.
    // Since the total only grows and TON reverts the whole tx on a throw, once `totalValue` +
    // reserve exceeds `msgValue` it is guaranteed insufficient, so we reject before any send.
    var totalValue: coins = 0;
    var totalWithdrawn: coins = 0;
    var iter = ArrayIterator<JettonWithdrawable_WithdrawFeeTransfer>.new(msg.transfers);
    while (!iter.empty()) {
        val transfer = iter.next();
        val ask = transfer.msg;

        totalValue += transfer.value;
        totalWithdrawn += ask.jettonAmount;
        assert(msgValue >= totalValue + JettonWithdrawable_MIN_RESERVE, JettonWithdrawable_Error.InsufficientValue);

        // Never burn: disallow relaying to the zero/none address regardless of the allowlist.
        if (ask.transferRecipient == createAddressNone()) {
            throw JettonWithdrawable_Error.ZeroAddressNotAllowed;
        }
        // When an allowlist is configured, every transfer must land on one of its recipients.
        if (allowedRecipients != null
            && !JettonWithdrawable.isAllowedRecipient(ask.transferRecipient, allowedRecipients!)) {
            throw JettonWithdrawable_Error.UnallowedRecipient;
        }
        // The caller guarantees each amount is within its permitted limit (e.g. accrued fees).
        assert(ask.jettonAmount <= maxAmount, JettonWithdrawable_Error.MaxAmountExceeded);
        // The fee-withdraw ask must not carry a `customPayload`: we own that slot to tag the
        // withdrawal context (opcode + initiator) so a bounce can be correlated back to this fee
        // withdrawal and the requesting party can be notified of the failure.
        assert(ask.customPayload == null, JettonWithdrawable_Error.UnallowedRecipient);

        val taggedAsk = AskToTransfer {
            queryId: ask.queryId,
            jettonAmount: ask.jettonAmount,
            transferRecipient: ask.transferRecipient,
            sendExcessesTo: ask.sendExcessesTo,
            customPayload: JettonWithdrawable_WithdrawContext {
                opcode: JettonWithdrawable_WITHDRAW_OPCODE,
                withdrawInitiator: sender,
            }.toCell(),
            forwardTonAmount: ask.forwardTonAmount,
            forwardPayload: ask.forwardPayload,
        };

        // Relay the transfer to the wallet holding the fee jettons with the caller's value, paying
        // forwarding fees out of it (SEND_MODE_REGULAR). Rich bounce so the full original
        // AskToTransfer (with the withdrawal context) comes back to us on failure.
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

    return totalWithdrawn;
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

/// Default handler for a bounced fee-withdrawal `AskToTransfer`: decodes the `WithdrawContext`
/// (which tags the ask and carries the initiator) and notifies the initiator of the failure. The
/// caller (a pool's `onBouncedMessage`) validates authorization first (e.g. that the bounce came
/// from the pool's own jetton wallet) and may layer pool-specific accounting (e.g. re-credit
/// `accruedFees`) on top.
///
/// @param wallet The jetton wallet the failed `AskToTransfer` was relayed to.
/// @param ask    The bounced `AskToTransfer` (still tagged with the `WithdrawContext`).
/// @dev Returns silently when the ask is not a recognized fee withdrawal, so the caller can treat
///      it as an unrelated `AskToTransfer` bounce.
fun JettonWithdrawable.onWithdrawBounced(
    wallet: address,
    ask: AskToTransfer,
): bool {
    val context = JettonWithdrawable.parseWithdrawContext(ask);
    if (context == null) {
        return false;
    }

    val failure = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: context!.withdrawInitiator,
        body: JettonWithdrawable_WithdrawFailed {
            wallet,
            ask,
        },
    });
    failure.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    return true;
}

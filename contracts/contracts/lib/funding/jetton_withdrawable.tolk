// SPDX-License-Identifier: MIT
tolk 1.4.1

import "../jetton/messages"
import "../utils"

const JettonWithdrawable_FACILITY_NAME = "link.chain.ton.lib.funding.JettonWithdrawable";
const JettonWithdrawable_FACILITY_ID = JettonWithdrawable_FACILITY_NAME.crc32() % 640 + 10;  // 545
// NOTE: inlined getFacilityId because compiler doesn't allow custom compile time functions
const JettonWithdrawable_ERROR_CODE = JettonWithdrawable_FACILITY_ID * 100;

const TOPIC_FEE_TOKEN_WITHDRAWN = "FeeTokenWithdrawn".crc32();

// Pool's own gas/storage reserve the inbound value must exceed on top of the summed transfer
// values. Each transfer's `value` pays the wallet's compute + forwarding (SEND_MODE_REGULAR), so
// this guarantees the caller funds the pool's own costs instead of drawing on pool custody.
const JettonWithdrawable_MIN_RESERVE = ton("0.1");

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

/// One concrete fee-withdrawal step: a destination wallet and the `AskToTransfer` to relay to it.
/// The wallet is explicit and expected to be derived by the caller (e.g. a pool).
struct JettonWithdrawable_WithdrawFeeTransfer {
    /// The Jetton wallet owning the fees that the `AskToTransfer` is sent to.
    wallet: address;
    /// TON value forwarded with the relay, paying the wallet's compute + forward fees (deducted via
    /// `SEND_MODE_REGULAR`). Caller allocates per transfer; pooled, `msgValue` must cover the sum + reserve.
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

/// Opcode embedding in the `WithdrawContext` tags a bounced `AskToTransfer` as a fee withdrawal,
/// distinguishing it from other asks a pool sends (e.g. release asks keep `customPayload` empty).
const JettonWithdrawable_WITHDRAW_OPCODE = "JettonWithdrawableWithdraw".crc32();

/// Correlated with each relayed fee-withdrawal `AskToTransfer` so a bounce knows (1) this is a fee
/// withdrawal and (2) who initiated it, to report the failure to.
/// @dev Stored in `AskToTransfer.customPayload` (which we require to be empty), mirroring the
///      `customPayload`-as-bounce-marker pattern used by burn/mint and the JettonLockBox.
struct JettonWithdrawable_WithdrawContext {
    opcode: uint32;
    /// The `sender` that initiated the withdrawal; a bounce is reported back to it.
    withdrawInitiator: address;
}

/// Failure reported to a withdrawal initiator when their fee-withdraw `AskToTransfer` bounced.
struct JettonWithdrawable_WithdrawFailed {
    /// The jetton wallet the failed withdrawal was sent to.
    wallet: address;
    ask: AskToTransfer;
}

/// Decodes the fee-withdrawal context from a (possibly bounced) `AskToTransfer`, or `null` if the
/// ask isn't a fee withdrawal (no `customPayload` or a non-matching opcode).
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
/// @dev The caller enforces its own access control (owner/fee-admin) *before* invoking this;
///      the handler only enforces the per-transfer allowlist, limit, and value-coverage invariants.
/// @param msgValue Inbound TON value; must cover the sum of relayed transfer values plus
///        `JettonWithdrawable_MIN_RESERVE`.
/// @param sender The caller; retained for attribution/observability.
/// @param msg The withdrawal request (wallet + transfer pairs, each with its own `value`).
/// @param maxAmount Upper bound per transfer; clients use their accrued-fee ledger (or MAX for
///        full-balance sweeps).
/// @param allowedRecipients Optional permit list of withdrawal destinations. When set, every
///        `transferRecipient` must be in this list, so funds can only be swept to allowlisted fee
///        aggregators. When `null`, any recipient is allowed except zero/none (which would burn).
/// @return totalWithdrawn Total jetton amount relayed
fun JettonWithdrawable.onWithdraw(
    msgValue: coins,
    sender: address,
    msg: JettonWithdrawable_Withdraw,
    maxAmount: coins,
    allowedRecipients: array<address>?,
): coins {
    // A running sum of relayed TON values + reserve must stay under `msgValue`
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
        // With an allowlist configured, every transfer must land on one of its recipients.
        if (allowedRecipients != null
            && !JettonWithdrawable.isAllowedRecipient(ask.transferRecipient, allowedRecipients!)) {
            throw JettonWithdrawable_Error.UnallowedRecipient;
        }
        // The caller guarantees each amount is within its permitted limit (e.g. accrued fees).
        assert(ask.jettonAmount <= maxAmount, JettonWithdrawable_Error.MaxAmountExceeded);
        // We own `customPayload` to tag the withdrawal context (opcode + initiator), input must be empty.
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

        // Relay the transfer with the caller's value, paying forwarding fees out of it
        // (SEND_MODE_REGULAR). Rich bounce returns the full original ask (with the context) on failure.
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
/// (tagging the ask and carrying the initiator) and notifies the initiator of the failure. The
/// caller (a pool's `onBouncedMessage`) validates authorization first (e.g. the bounce came from
/// the pool's own jetton wallet) and may layer pool-specific accounting (e.g. re-credit `accruedFees`).
///
/// @param wallet The jetton wallet the failed `AskToTransfer` was relayed to.
/// @param ask    The bounced `AskToTransfer`, still tagged with the `WithdrawContext`.
/// @dev Returns silently when the ask isn't a recognized fee withdrawal, so the caller can treat
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

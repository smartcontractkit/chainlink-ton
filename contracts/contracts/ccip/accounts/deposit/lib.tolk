// SPDX-License-Identifier: BUSL-1.1

import "@stdlib/common"

import "../../../lib/jetton/messages"
import "types"
import "messages"
import "storage"

/// Base abstract component shared by all deposit-account contracts.
///
/// A deposit account holds jettons received into its own (derived) jetton wallet and lets a fixed
/// set of `beneficiaries` withdraw them. Any message arriving from the account's allowed jetton
/// wallet is either forwarded to the `proxy` (default) or handed to a hook that a specialized
/// account (e.g. OnRampAccount) may override.
///
/// @dev Mirrors the `TokenPool<T>` component pattern: `data` holds the persistent account config,
///      `context` carries per-account working state, and `hooks` lets specialized accounts extend
///      default behaviour without duplicating logic.
struct DepositAccount<T> {
    // Data required to manage the account
    data: DepositAccount_Data;
    // Extra data for specialized accounts (e.g. OnRampAccount) to attacth to the context.
    extra: T?;
    // Hooks that a specialized account may wire to override default behaviour.
    hooks: DepositAccount_Hooks<T>? = null;
}

// Context struct for DepositAccount hooks: carries the account's persistent data and any extra
// data the specialized account attached to the context.
struct DepositAccount_Context<T> {
    data: DepositAccount_Data;
    extra: T?;
}

/// Hook extensions exposed by the DepositAccount contract.
struct DepositAccount_Hooks<T> {
    /// Called on `DepositAccount_Init`. When null, the default init runs (owner/proxy-only, sets
    /// the allowed jetton wallet, replies to the initiator).
    onInit: ((DepositAccount_Context<T>, address, DepositAccount_Init) -> void)?;
    /// Called on `DepositAccount_Withdraw`. When null, the default withdraw runs (beneficiary
    /// check + AskToTransfer to the wallet).
    onWithdraw: ((DepositAccount_Context<T>, address, DepositAccount_Withdraw) -> void)?;
    /// Called when a beneficiary's `AskToTransfer` (withdraw to the account's wallet) bounced.
    /// When null, the default behaviour notifies the requester — the beneficiary that sent the
    /// withdraw, identified by `ask.sendExcessesTo` — with `DepositAccount_WithdrawFailed` so the
    /// failure is surfaced for reconciliation.
    ///
    /// @param 0 context  The account's working context (`T`, read-only).
    /// @param 1 wallet   The jetton wallet the failed AskToTransfer was sent to.
    /// @param 2 ask      The bounced AskToTransfer (amount + recipient + requester for reconciliation).
    onWithdrawBounced: ((DepositAccount_Context<T>, address, AskToTransfer) -> void)?;
    /// Called for a message that is not a recognized DepositAccount message — i.e. the Jetton
    /// transfer notification whose body/forward payload a specialized account acts on. When null,
    /// the default behaviour forwards the message to the account's `proxy`. Returns `true` when the
    /// hook accepted the message, `false` when it left it unhandled (in which case the caller falls
    /// back to bouncing non-empty unrecognized bodies).
    ///
    /// @param 0 context  The account's working context (`T`, read-only).
    /// @param 1 message  The forwarded in-message envelope (sender, attached value, raw body).
    onForwardNotification: ((DepositAccount_Context<T>, DepositAccount_InMessageForward) -> bool)?;
    /// Called when a message this account forwarded bounced back (e.g. a `Router_CCIPSend` that
    /// the Router rejected with `InsufficientFee`). When null, the default behaviour notifies the
    /// account's `proxy` with `DepositAccount_ForwardFailed` so the proxy can react (e.g. let the
    /// user withdraw the held deposit).
    ///
    /// @param 0 context    The account's working context (`T`, read-only).
    /// @param 1 bouncedFrom The contract that bounced the forwarded message.
    /// @param 2 bouncedBody The bounced message body (the original forwarded body).
    onForwardBounced: ((DepositAccount_Context<T>, address, cell) -> void)?;
}

@inline
fun DepositAccount<T>.load(
        data: DepositAccount_Data? = null,
        extra: T? = null,
        hooks: DepositAccount_Hooks<T>? = null
): DepositAccount<T> {
    if (data == null) {
        data = DepositAccount_Data.load();
    }

    return DepositAccount<T> { data,  extra , hooks };
}

fun DepositAccount<T>.context(self) {
    return DepositAccount_Context<T> { data: self.data, extra: self.extra };
}

fun DepositAccount<T>.store(self) {
    self.data.store();
}

/// Dispatches a DepositAccount inbound message. Returns `true` if the message was accepted (a
/// recognized control message or a message from the allowed jetton wallet), `false` otherwise
/// (the body is empty / was not handled) — mirroring the TokenPool's `onInternalMessage`.
///
/// Recognized messages (Init, Withdraw) are handled here — through their hook when wired, or via
/// the default implementation. Anything else arriving from the account's allowed jetton wallet is
/// routed to `onForwardNotification` (defaulting to a forward to `proxy`), carrying the full
/// `forwarded` envelope the caller built from the original in-message; all other messages are left
/// unhandled.
///
/// @param msgSender   Address of the message sender.
/// @param msgValue    Toncoins attached to the message.
/// @param msgBody     Slice of the message body (parsed as `DepositAccount_InMessage`).
/// @param forwarded   Full metadata envelope of the incoming message, forwarded to the proxy or
///                    `onForwardNotification` hook on the deposit path. The caller builds it from
///                    the original `InMessage` so all fields (`valueExtra`, `originalForwardFee`,
///                    `createdLt`, `createdAt`, `body`) are preserved.
fun DepositAccount<T>.onInternalMessage(
    mutate self,
    msgSender: address,
    msgValue: coins,
    msgBody: slice,
    forwarded: DepositAccount_InMessageForward,
): bool {
    val msg = lazy DepositAccount_InMessage.fromSlice(msgBody);

    match (msg) {
        DepositAccount_Init => {
            self.onInit(msgSender, msg);
        }
        DepositAccount_Withdraw => {
            self.onWithdraw(msgSender, msg);
        }
        else => {
            // Any message that is not a recognized DepositAccount message is handed to the
            // forward-notification path (which returns whether it accepted the message).
            return self.onForwardNotification(forwarded);
        }
    }

    return true; // default
}

/// Configures the account and replies to the initiator.
/// @dev Wires the `onInit` hook when one is set; otherwise runs the default init — only the owner
///      may initialize the account. The party that deploys the account is expected to be its owner
///      (e.g. the pool for off-ramp accounts, the Router for on-ramp accounts).
fun DepositAccount<T>.onInit(
    mutate self,
    sender: address,
    msg: DepositAccount_Init,
) {
    if (self.hooks != null && self.hooks.onInit != null) {
        self.hooks.onInit(self.context(), sender, msg);
        return;
    }

    assert(sender == self.data.owner, DepositAccount_Error.OnlyOwner);

    // Send Reply to the initiator so it knows the account is ready.
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: DepositAccount_Reply {
            queryId: msg.queryId,
            forwardPayload: msg.forwardPayload,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Allows a beneficiary to withdraw jettons from this account's wallet.
/// @dev Wires the `onWithdraw` hook when one is set; otherwise runs the default withdraw
///      (beneficiary check + AskToTransfer message to the wallet).
fun DepositAccount<T>.onWithdraw(
    self,
    sender: address,
    msg: DepositAccount_Withdraw,
) {
    if (self.hooks != null && self.hooks.onWithdraw != null) {
        self.hooks.onWithdraw(self.context(), sender, msg);
        return;
    }

    assert(self.data.beneficiaries.exists(sender), DepositAccount_Error.OnlyBeneficiary);

    val ask = lazy msg.ask.load();

    // The AskToTransfer must carry the requester as `sendExcessesTo` so a bounce can be correlated
    // back to the sender and notified on the failure path.
    assert(ask.sendExcessesTo != null && ask.sendExcessesTo! == sender, DepositAccount_Error.OnlySendExcessesToSender);

    val transfer = createMessage({
        bounce: BounceMode.RichBounce,
        value: 0,
        dest: msg.walletAddress,
        body: msg.ask,
    });
    transfer.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

/// Handles a message that is not a recognized DepositAccount message. Returns `true` if the message
/// was accepted and consumed, `false` if the message was left unhandled. Wires the
/// `onForwardNotification` hook when one is set — the hook's return value is what the caller sees;
/// otherwise the default forwards the message to the account's `proxy`, carrying the full in-message
/// envelope so the proxy (TP, Router) can verify everything, and always returns `true`.
fun DepositAccount<T>.onForwardNotification(
    self,
    forwarded: DepositAccount_InMessageForward,
): bool {
    if (self.hooks != null && self.hooks.onForwardNotification != null) {
        return self.hooks.onForwardNotification(self.context(), forwarded);
    }

    val notification = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: self.data.proxy,
        body: DepositAccount_ForwardNotification {
            message: forwarded.toCell(),
        },
    });
    notification.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
    return true;
}

/// Handles a bounced outgoing message. Returns `true` if the bounce was recognized and consumed.
///
/// The withdraw path sends an `AskToTransfer` to the account's jetton wallet with `RichBounce`, so
/// a failed transfer bounces back here. When the bounced body is that `AskToTransfer`, the transfer
/// could not be executed (e.g. the wallet ran out of funds or the recipient rejected it); the jettons
/// remain credited to the account. The `onWithdrawBounced` hook is wired if set, otherwise the owner
/// is notified via `DepositAccount_WithdrawFailed` so the failure is surfaced for reconciliation.
///
/// @param bouncedSender Address that sent the bounce (the account's jetton wallet for a withdraw).
/// @param bouncedBody   The bounced message body (`RichBounceBody` envelope).
fun DepositAccount<T>.onBouncedMessage(
    self,
    bouncedSender: address,
    bouncedBody: slice,
): bool {
    // A `RichBounce` body arrives wrapped in the `RichBounceBody` envelope (opcode 0xfffffffe).
    val rich = lazy RichBounceBody.fromSlice(bouncedBody);

    val bounced = lazy DepositAccount_BouncedMessage.fromCell(rich.originalBody);
    match (bounced) {
        AskToTransfer => {
            if (self.hooks != null && self.hooks.onWithdrawBounced != null) {
                self.hooks.onWithdrawBounced(self.context(), bouncedSender, bounced);
            } else {
                self.onWithdrawBounced(bouncedSender, bounced);
            }
            return true;
        }
        else => {
            // Any other bounced message (e.g. a forwarded `Router_CCIPSend`) is surfaced to the
            // proxy so it can react. Returns true so the bounce is considered consumed.
            if (self.hooks != null && self.hooks.onForwardBounced != null) {
                self.hooks.onForwardBounced(self.context(), bouncedSender, rich.originalBody);
            } else {
                self.onForwardBounced(bouncedSender, rich.originalBody);
            }
            return true;
        }
    }
}

/// Default handler for a bounced forwarded message: notifies the account's `proxy` (the destination
/// of the forward) so it can react — e.g. a `Router_CCIPSend` the Router rejected lets the user
/// withdraw the held deposit.
fun DepositAccount<T>.onForwardBounced(
    self,
    bouncedFrom: address,
    bouncedBody: cell,
) {
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: self.data.proxy,
        body: DepositAccount_ForwardFailed {
            bouncedFrom,
            bouncedBody,
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

/// Default handler for a bounced withdraw `AskToTransfer`: notifies the requester (the beneficiary
/// that sent the withdraw, carried in `ask.sendExcessesTo`) so the failure is surfaced to them. The
/// `onWithdraw` default requires `ask.sendExcessesTo == sender`, so this destination is a trusted
/// beneficiary.
fun DepositAccount<T>.onWithdrawBounced(
    self,
    walletAddress: address,
    ask: AskToTransfer,
) {
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: ask.sendExcessesTo!,
        body: DepositAccount_WithdrawFailed {
            queryId: ask.queryId,
            walletAddress,
            ask: ask.toCell(),
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

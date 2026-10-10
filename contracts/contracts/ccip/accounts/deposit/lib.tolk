// SPDX-License-Identifier: BUSL-1.1

import "@stdlib/common"

import "../../../lib/jetton/messages"
import "../../../lib/deployable/types"
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
    /// Called on `DepositAccount_Init`. When null, the default init runs (owner-only — the init
    /// is sent directly by the owner right after `Deployable_Initialize` — reserves rent, replies
    /// to the owner).
    onInit: ((DepositAccount_Context<T>, address, DepositAccount_Init, coins) -> void)?;
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
/// recognized control message or a jetton transfer notification), `false` otherwise (the body is
/// empty / was not handled) — mirroring the TokenPool's `onInternalMessage`.
///
/// Recognized control messages (Init, Withdraw) are handled here — through their hook when wired,
/// or via the default implementation. A `TransferNotificationForRecipient` (the jetton deposit
/// notification) is routed to `onForwardNotification` (defaulting to a forward to `proxy`),
/// carrying the full `forwarded` envelope the caller built from the original in-message. All
/// other messages — including a retried `Deployable_Initialize` (the first message of the
/// deployment sequence, which must bounce off the already-upgraded account) — are left unhandled
/// and bounce.
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
            self.onInit(msgSender, msg, msgValue);
        }
        DepositAccount_Withdraw => {
            self.onWithdraw(msgSender, msg);
        }
        TransferNotificationForRecipient => {
            // Only jetton deposit notification is proxied. Everything else, such as retried `Deployable_Initialize`, is left unhandled and bounces.
            return self.onForwardNotification(forwarded);
        }
        else => {
            return false;
        }
    }

    return true; // default
}

/// Configures the account and replies to the owner.
/// @dev Wires the `onInit` hook when one is set; otherwise runs the default init. The init is
///      only accepted from the account's owner: the deployment sequence is `Deployable_Initialize`
///      (installs the account's code/data) followed by `DepositAccount_Init` sent directly by the
///      owner, so only an owner-sent init proves an authorized deployment. The party that deploys
///      the account is expected to be its owner (e.g. the pool for off-ramp accounts, the Router
///      for on-ramp accounts), and the `DepositAccount_Reply` is sent to that owner so it can
///      correlate the deployment back to the operation that triggered it (via
///      `msg.forwardPayload`). The init is a ping: the account always replies, confirming it is
///      deployed.
fun DepositAccount<T>.onInit(
    mutate self,
    sender: address,
    msg: DepositAccount_Init,
    msgValue: coins,
) {
    if (self.hooks != null && self.hooks.onInit != null) {
        self.hooks.onInit(self.context(), sender, msg, msgValue);

        return;
    }

    assert(sender == self.data.owner, DepositAccount_Error.OnlyOwner);
    // `contract.getOriginalBalance()` (TVM `BALANCE`) is the balance at the start of the compute
    // phase, (balance + inbound message's value)
    if (contract.getOriginalBalance() < DepositAccount_MIN_GRAM_TO_RESERVE + DepositAccount_MIN_GRAM_TO_INIT) {
        val reply = createMessage({
            bounce: BounceMode.NoBounce,
            value: 0,
            dest: sender,
            body: DepositAccount_NotEnoughValue {
                queryId: msg.queryId,
                forwardPayload: msg.forwardPayload,
            },
        });
        reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        return;
    }


    reserveGramsOnBalance(DepositAccount_MIN_GRAM_TO_RESERVE, RESERVE_MODE_EXACT_AMOUNT);

    // Send Reply to the owner so it knows the account is ready.
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: sender,
        body: DepositAccount_Reply {
            queryId: msg.queryId,
            token: self.data.token,
            forwardPayload: msg.forwardPayload,
        },
    });
    // SAFETY: reserveGramsOnBalance is called before
    reply.send(SEND_MODE_CARRY_ALL_BALANCE);
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
    assert(ask.sendExcessesTo != null && ask.sendExcessesTo == sender, DepositAccount_Error.OnlySendExcessesToSender);

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

/// Handles a bounced outgoing message. Returns `true` if the bounce was recognized and consumed,
/// `false` otherwise — specialized accounts may handle additional bounce types themselves.
///
/// The default only recognizes the withdraw path's bounced `AskToTransfer` (sent to the account's
/// jetton wallet with `RichBounce`): the transfer could not be executed (e.g. the wallet ran out of
/// funds or the recipient rejected it) and the jettons remain credited to the account. The
/// `onWithdrawBounced` hook is wired if set, otherwise the requester is notified via
/// `DepositAccount_WithdrawFailed` so the failure is surfaced for reconciliation.
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
            self.onWithdrawBounced(bouncedSender, bounced);
            return true;
        }
        else => {
            // Not handled by the default — leave it for a specialized account.
            return false;
        }
    }
}

/// Default handler for a bounced withdraw `AskToTransfer`: notifies the requester (the beneficiary
/// that sent the withdraw, carried in `ask.sendExcessesTo`) so the failure is surfaced to them. The
/// `onWithdraw` default requires `ask.sendExcessesTo == sender`, so this destination is a trusted
/// beneficiary.
fun DepositAccount<T>.onWithdrawBounced(
    self,
    sender: address,
    ask: AskToTransfer,
) {
    if (self.hooks != null && self.hooks.onWithdrawBounced != null) {
        self.hooks.onWithdrawBounced(self.context(), sender, ask);

        return;
    }

    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: ask.sendExcessesTo!,
        body: DepositAccount_WithdrawFailed {
            queryId: ask.queryId,
            id: DepositAccountID {
                owner: self.data.owner,
                proxy: self.data.proxy,
                token: self.data.token,
            }.toCell(),
            walletAddress: sender,
            ask: ask.toCell(),
        },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

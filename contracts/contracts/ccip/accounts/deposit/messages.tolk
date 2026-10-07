// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"
import "../../../lib/deployable/types"

/// Initialization message sent by the owner to activate the account.
/// @dev Wallet/sender authorization is NOT held in the account: it's verified by the party that
///      knows the token (off-ramp: the pool on `DepositAccount_ForwardNotification`; on-ramp:
///      the token-handling layer before a withdraw). The account is bound to a single jetton
///      through its address derivation, so there is one account per (user, token) pair.
///      The message is only accepted from the account's owner: the deployment sequence is
///      `Deployable_Initialize` (installs the account's code/data) followed by this init sent
///      directly by the owner. The account always replies with `DepositAccount_Reply`, confirming
///      it is deployed.
struct (0x6890a205) DepositAccount_Init {
    /// Correlation ID echoed in the DepositAccount_Reply.
    queryId: uint64;
    /// Optional context forwarded back in the DepositAccount_Reply.
    forwardPayload: cell?;
}

/// Reply message on successful initialization
/// TODO rename to `DepositAccount_Initialized`
struct (0xda04630c) DepositAccount_Reply {
    queryId: uint64;
    forwardPayload: cell?;
}

/// Reply message on failed initialization due to insufficient value.
struct (0x83462e93) DepositAccount_NotEnoughValue {
    queryId: uint64;
    forwardPayload: cell?;
}

/// Forwarded notification sent to the proxy on messages from specific jetton wallet.
/// @dev Carries the full original in-message metadata so the proxy (e.g, TP, Router, etc.) can verify everything.
struct (0xb4fe5c0c) DepositAccount_ForwardNotification {
    // Forwarded in-message
    message: Cell<DepositAccount_InMessageForward>;
}

/// Routing envelope placed as the jetton transfer's forward payload. When an incoming
/// `TransferNotificationForRecipient` carries it, the account forwards the notification to
/// `notify` instead of the `proxy`.
/// @dev The envelope is untrusted: `notify` must authenticate the forwarded message itself
///      (account address, original jetton wallet sender and amount).
struct (0x88e0ef3e) DepositAccount_Notify {
    notify: address;
    payload: cell?;
}

/// Metadata about a forwarded incoming message, sent to the pool for verification.
/// @dev Contains the original message body cell for the pool to parse as a jetton notification.
/// Other fields (valueCoins, valueExtra, etc.) are captured for auditability but may not be consumed by all pool types.
struct DepositAccount_InMessageForward {
    senderAddress: address
    valueCoins: coins
    valueExtra: ExtraCurrenciesMap
    originalForwardFee: coins
    createdLt: uint64
    createdAt: uint32
    body: cell
}

/// Sent by the beneficiary to transfer jettons from this account's wallet to an external recipient.
/// @dev `ask.sendExcessesTo` MUST equal the requester (the beneficiary sending this message): it is
///      validated by the default `onWithdraw` handler and is what a bounced withdraw is correlated
///      back to, so the requester can be notified on the failure path.
struct (0x1936d112) DepositAccount_Withdraw {
    queryId: uint64;
    /// Jetton wallet address to send the AskToTransfer to.
    walletAddress: address;
    /// Jetton transfer params (amount, recipient, etc.) sent as the outgoing message body.
    /// `ask.sendExcessesTo` must be the requester.
    ask: Cell<AskToTransfer>;
}

/// Notification sent to the withdraw requester (the beneficiary that sent the `DepositAccount_Withdraw`,
/// identified by the bounced `AskToTransfer`'s `sendExcessesTo`) when the transfer bounced and the
/// funds could not be transferred out.
struct (0xa51b6cba) DepositAccount_WithdrawFailed {
    queryId: uint64;
    /// Self-reported: the recipient must re-derive the account address from it and match it
    /// against the sender before believing it.
    account: Cell<DepositAccount_Identity>;
    /// Jetton wallet the failed AskToTransfer was sent to.
    walletAddress: address;
    /// The bounced AskToTransfer (carries amount + recipient + the requester in `sendExcessesTo` for reconciliation).
    ask: Cell<AskToTransfer>;
}

/// What a deposit account reports about itself so a recipient can re-derive its address.
struct DepositAccount_Identity {
    owner: address;
    proxy: address;
    token: address;
}

/// The subset of outgoing messages that can bounce back into this account, used to match bounced
/// bodies in `onBouncedMessage`. A bounced `AskToTransfer` (from withdraw) is the recoverable case.
type DepositAccount_BouncedMessage =
    | AskToTransfer;

/// All recognized incoming message types.
///
/// `TransferNotificationForRecipient` is the jetton deposit notification: the only external
/// message (besides control messages) the account accepts — it is routed to the
/// forward-notification path. Everything else bounces.
type DepositAccount_InMessage =
    | DepositAccount_Init
    | DepositAccount_Withdraw
    | TransferNotificationForRecipient;

/// All outgoing message types this contract may produce.
type DepositAccount_OutMessage =
    | DepositAccount_ForwardNotification
    | DepositAccount_Reply
    | DepositAccount_NotEnoughValue
    | DepositAccount_WithdrawFailed
    | AskToTransfer;

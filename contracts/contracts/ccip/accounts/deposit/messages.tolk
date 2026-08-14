// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"

/// Initialization message sent by the owner to activate the account and set the allowed jetton wallet.
struct (0x552706d7) DepositAccount_Init {
    /// Correlation ID echoed in the DepositAccount_Reply.
    queryId: uint64;
    /// Only messages from this wallet are forwarded to the pool.
    allowedJettonWallet: address;
    /// Optional context forwarded back in the DepositAccount_Reply.
    forwardPayload: cell?;
}

/// Reply message on successful initialization
struct (0xb2e46750) DepositAccount_Reply {
    queryId: uint64;
    forwardPayload: cell?;
}

/// Forwarded notification sent to the proxy on messages from specific jetton wallet.
/// @dev Carries the full original in-message metadata so the proxy (e.g, TP, Router, etc.) can verify everything.
struct (0xdb3b18bf) DepositAccount_ForwardNotification {
    // Forwarded in-message
    message: Cell<DepositAccount_InMessageForward>;
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
struct (0xb8f621d2) DepositAccount_Withdraw {
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
struct (0x7a42d91e) DepositAccount_WithdrawFailed {
    queryId: uint64;
    /// Jetton wallet the failed AskToTransfer was sent to.
    walletAddress: address;
    /// The bounced AskToTransfer (carries amount + recipient + the requester in `sendExcessesTo` for reconciliation).
    ask: Cell<AskToTransfer>;
}

/// Notification sent to the account's `proxy` when a message this account forwarded (e.g. a
/// `Router_CCIPSend` to the Router) bounced back because the destination rejected it. The proxy can
/// react, e.g. by letting the user withdraw the held deposit.
struct (0x3f51a724) DepositAccount_ForwardFailed {
    /// The contract that bounced the forwarded message (e.g. the Router).
    bouncedFrom: address;
    /// The bounced message body (the original forwarded body) for the proxy to inspect.
    bouncedBody: cell;
}

/// The subset of outgoing messages that can bounce back into this account, used to match bounced
/// bodies in `onBouncedMessage`. A bounced `AskToTransfer` (from withdraw) is the recoverable case.
type DepositAccount_BouncedMessage =
    | AskToTransfer;

/// All recognized incoming message types.
type DepositAccount_InMessage =
    | DepositAccount_Init
    | DepositAccount_Withdraw;

/// All outgoing message types this contract may produce.
type DepositAccount_OutMessage =
    | DepositAccount_ForwardNotification
    | DepositAccount_Reply
    | DepositAccount_WithdrawFailed
    | DepositAccount_ForwardFailed
    | AskToTransfer;

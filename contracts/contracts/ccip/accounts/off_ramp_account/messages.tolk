// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"

/// Sent by the pool to activate a deployed OffRampAccount (sets allowed jetton wallet).
/// @dev Sent as an on-chain message to the OffRampAccount address during deployment.
struct (0x552706d7) OffRampAccount_Init {
    /// Correlation ID echoed in the OffRampAccount_Reply.
    queryId: uint64;
    /// Only messages from this wallet are forwarded to the pool.
    allowedJettonWallet: address;
    /// Optional context forwarded back in the OffRampAccount_Reply.
    forwardPayload: cell?;
}

/// Sent by the pool after successful initialization, confirming the account is ready.
/// The pool identifies which OffRampAccount replied from `in.senderAddress`.
struct (0xb2e46750) OffRampAccount_Reply {
    queryId: uint64;
    forwardPayload: cell?;
}

/// Forwarded notification sent to the pool when a jetton message arrives.
/// Carries the full original in-message metadata so the pool can verify everything.
struct (0xdb3b18bf) OffRampAccount_ForwardNotification {
    // Forwarded in-message
    message: Cell<OffRampAccount_InMessageForward>;
}

/// Metadata about a forwarded incoming message, sent to the pool for verification.
/// @dev Contains the original message body cell for the pool to parse as a jetton notification.
/// Other fields (valueCoins, valueExtra, etc.) are captured for auditability but may not be consumed by all pool types.
struct OffRampAccount_InMessageForward {
    senderAddress: address
    valueCoins: coins
    valueExtra: ExtraCurrenciesMap
    originalForwardFee: coins
    createdLt: uint64
    createdAt: uint32
    body: cell
}

/// Sent by the owner to transfer jettons from this account's wallet to an external recipient.
struct (0xb8f621d2) OffRampAccount_Withdraw {
    queryId: uint64;
    /// Jetton wallet address to send the AskToTransfer to.
    walletAddress: address;
    /// Jetton transfer parameters (amount, recipient, etc.).
    ask: AskToTransfer;
}

/// All recognized incoming message types.
type OffRampAccount_InMessage =
    | OffRampAccount_Init
    | OffRampAccount_Withdraw;

/// All outgoing message types this contract may produce.
type OffRampAccount_OutMessage =
    | OffRampAccount_ForwardNotification
    | OffRampAccount_Reply
    | AskToTransfer;
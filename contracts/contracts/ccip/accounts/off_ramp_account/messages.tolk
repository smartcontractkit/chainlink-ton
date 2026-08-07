// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"

/// @notice Sent by the pool to activate a deployed OffRampAccount (sets allowed jetton wallet).
/// @dev Sent as an on-chain message to the OffRampAccount address during deployment.
/// @param queryId Correlation ID echoed in the OffRampAccount_Reply.
/// @param allowedJettonWallet Only messages from this wallet are forwarded to the pool.
/// @param forwardPayload Optional context forwarded back in the OffRampAccount_Reply.
struct (0xf1a2b3c4) OffRampAccount_Init {
    queryId: uint64;
    /// Only messages from this jetton wallet will be forwarded (prevents spam).
    allowedJettonWallet: address;
    /// Optional context cell that will be forwarded back in the reply.
    forwardPayload: cell?;
}

/// @notice Sent by the pool after successful initialization, confirming the account is ready.
/// The pool identifies which OffRampAccount replied from `in.senderAddress`.
struct (0xd2e3f4a5) OffRampAccount_Reply {
    queryId: uint64;
    forwardPayload: cell?;
}

/// @notice Forwarded notification sent to the pool when a jetton message arrives.
/// Carries the full original in-message metadata so the pool can verify everything.
struct (0xa7b8c9d0) OffRampAccount_ForwardNotification {
    // Forwarded in-message
    message: Cell<OffRampAccount_InMessageForward>;
}

/// @notice Metadata about a forwarded incoming message, sent to the pool for verification.
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

/// @notice Sent by the owner to transfer jettons from this account's wallet to an external recipient.
/// @param walletAddress The jetton wallet address to send the transfer from.
/// @param ask The jetton transfer parameters (amount, recipient, etc.).
struct (0xe3f4a5b6) OffRampAccount_Withdraw {
    queryId: uint64;
    walletAddress: address;
    ask: AskToTransfer;
}

/// @notice All recognized incoming message types.
type OffRampAccount_InMessage =
    | OffRampAccount_Init
    | OffRampAccount_Withdraw;

/// @notice All outgoing message types this contract may produce.
type OffRampAccount_OutMessage =
    | OffRampAccount_ForwardNotification
    | OffRampAccount_Reply
    | AskToTransfer;
// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"
import "types"

/// @notice Initializes a new OffRampAccount instance.
/// @param owner The recipient who can withdraw jettons from this account.
/// @param notificationTarget The pool contract that receives forwarded notifications.
/// @param allowedJettonWallet Only messages from this jetton wallet will be forwarded.
/// @param forwardPayload Context cell for the pool to correlate with the Reply.
struct (0xf1a2b3c4) OffRampAccount_Init {
    queryId: uint64;
    /// Only messages from this jetton wallet will be forwarded (prevents spam).
    allowedJettonWallet: address;
    /// Optional context cell that will be forwarded back in the reply.
    forwardPayload: cell?;
}

/// @notice Reply sent by OffRampAccount after successful initialization.
/// Sent to the notificationTarget (pool) to confirm the account is ready.
/// The pool identifies the sender from in.senderAddress.
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

/// @notice Forwarded message info passed from OffRampAccount to the pool.
/// Contains the original message metadata plus the message body cell.
struct OffRampAccount_InMessageForward {
    senderAddress: address
    valueCoins: coins
    valueExtra: ExtraCurrenciesMap
    originalForwardFee: coins
    createdLt: uint64
    createdAt: uint32
    body: cell
}

/// @notice Owner-withdrawable: transfers jettons from this account's wallet to a recipient.
/// @param walletAddress The jetton wallet address to send the transfer from.
/// @param recipient The recipient owner address.
/// @param amount The amount to withdraw.
struct (0xe3f4a5b6) OffRampAccount_Withdraw {
    queryId: uint64;
    walletAddress: address;
    recipient: address;
    amount: coins;
}

/// Union of all incoming messages - accepts jetton notifications and owner commands.
type OffRampAccount_InMessage =
    | OffRampAccount_Init
    | OffRampAccount_Withdraw;

/// Union of all outgoing messages.
type OffRampAccount_OutMessage =
    | OffRampAccount_ForwardNotification
    | OffRampAccount_Reply
    | AskToTransfer;
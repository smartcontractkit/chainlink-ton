// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"

/// Deposits the token into the lockbox (received as fwdPayload of Jetton.TransferNotificationForRecipient).
/// @param token The address of the token to deposit.
/// @param remoteChainSelector The chain selector of the remote chain.
/// @param amount The amount of tokens to deposit.
struct (0x18024cb6) JettonLockbox_Deposit {
    queryId: uint64;
    token: address;
    remoteChainSelector: uint64;
    amount: coins;
}

/// Withdraws tokens to a specific recipient.
/// @param token The address of the token to withdraw.
/// @param remoteChainSelector The chain selector of the remote chain.
/// @param amount The amount of tokens to withdraw.
/// @param recipientWallet The jetton wallet address of the recipient.
struct (0xc85418fe) JettonLockbox_Withdraw {
    queryId: uint64;
    token: address;
    remoteChainSelector: uint64;
    amount: coins;
    recipientWallet: address;
}

/// Bounced message types this contract handles.
type JettonLockbox_BouncedMessage =
    | AskToTransfer;

struct (0xde7934db) JettonLockbox_Deposited {
    queryId: uint64;
    token: address;
    remoteChainSelector: uint64;
    amount: coins;
}

/// Contract initialization message.
/// @param minterAddress The jetton minter address.
/// @param walletAddress The jetton wallet address for this lockbox.
/// @param admin The admin address.
struct (0x06d08cef) JettonLockbox_Init {
    queryId: uint64;
    minterAddress: address;
    walletAddress: address;
    admin: address?; // msg.senderAddress as default if not provided
}

/// Initialization complete event.
/// @param minterAddress The jetton minter address.
/// @param walletAddress The jetton wallet address.
/// @param admin The admin address.
struct (0x6131dd8f) JettonLockbox_Initialized {
    queryId: uint64;
    minterAddress: address;
    walletAddress: address;
    admin: address;
}

/// Withdrawal failed error message sent to the withdraw initiator on bounce.
/// @param token The jetton minter address.
/// @param amount The amount that failed to withdraw.
/// @param recipientWallet The recipient wallet address.
struct (0x3dfc5d66) JettonLockbox_WithdrawFailed {
    queryId: uint64;
    token: address;
    amount: coins;
    recipientWallet: address;
}

/// Withdrawal completed successfully - sent to replyTo address.
/// @param token The jetton minter address.
/// @param amount The amount withdrawn.
/// @param recipientWallet The recipient wallet address.
struct (0x17c24008) JettonLockbox_WithdrawCompleted {
    queryId: uint64;
    token: address;
    amount: coins;
    recipientWallet: address;
}

/// Union of all incoming messages this contract handles.
type JettonLockbox_InMessage =
    | JettonLockbox_Init
    | JettonLockbox_Withdraw
    | TransferNotificationForRecipient;

/// Union of all outgoing messages this contract handles.
type JettonLockbox_OutMessage =
    | JettonLockbox_Deposited
    | JettonLockbox_Initialized
    | JettonLockbox_WithdrawFailed
    | JettonLockbox_WithdrawCompleted;

// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"

/// Deposits the token into the lockbox (received as fwdPayload of Jetton.TransferNotificationForRecipient).
/// @param token The address of the token to deposit.
/// @param remoteChainSelector The chain selector of the remote chain.
/// @param amount The amount of tokens to deposit.
struct (0x17c24001) JettonLockbox_Deposit {
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
struct (0x17c24002) JettonLockbox_Withdraw {
    queryId: uint64;
    token: address;
    remoteChainSelector: uint64;
    amount: coins;
    recipientWallet: address;
}

/// Bounced message types this contract handles.
type JettonLockbox_BouncedMessage =
    | AskToTransfer;

struct (0x17c24003) JettonLockbox_Deposited {
    queryId: uint64;
    token: address;
    remoteChainSelector: uint64;
    amount: coins;
}

/// Contract initialization message.
/// @param minterAddress The jetton minter address.
/// @param walletAddress The jetton wallet address for this lockbox.
/// @param admin The admin address.
struct (0x17c24005) JettonLockbox_Init {
    queryId: uint64;
    minterAddress: address;
    walletAddress: address;
    admin: address?; // msg.senderAddress as default if not provided
}

/// Initialization complete event.
/// @param minterAddress The jetton minter address.
/// @param walletAddress The jetton wallet address.
/// @param admin The admin address.
struct (0x17c24006) JettonLockbox_Initialized {
    queryId: uint64;
    minterAddress: address;
    walletAddress: address;
    admin: address;
}

/// Withdrawal failed error message sent to the withdraw initiator on bounce.
/// @param token The jetton minter address.
/// @param amount The amount that failed to withdraw.
/// @param recipientWallet The recipient wallet address.
struct (0x17c24004) JettonLockbox_WithdrawFailed {
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
    | JettonLockbox_WithdrawFailed;

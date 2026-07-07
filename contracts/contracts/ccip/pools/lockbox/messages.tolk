// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"

/// Deposits the token into the lockbox (received as fwdPayload of Jetton.TransferNotificationForRecipient).
/// @param token The address of the token to deposit.
/// @param remoteChainSelector The chain selector of the remote chain.
/// @param amount The amount of tokens to deposit.
struct (0x9e9ec361) JettonLockBox_Deposit {
    queryId: uint64;
    token: address;
    remoteChainSelector: uint64;
    amount: coins;
}

/// Optional extra fields for JettonLockBox_Withdraw (stored in a cell ref to avoid overflow).
struct JettonLockBox_WithdrawExtra {
    sendExcessesTo: address?;
}

/// Withdraws tokens to a specific recipient.
/// @param token The address of the token to withdraw.
/// @param remoteChainSelector The chain selector of the remote chain.
/// @param amount The amount of tokens to withdraw.
/// @param recipientWallet The jetton wallet address of the recipient.
/// @param extra Optional extra fields (sendExcessesTo for ReturnExcessesBack routing).
struct (0xd065c306) JettonLockBox_Withdraw {
    queryId: uint64;
    token: address;
    remoteChainSelector: uint64;
    amount: coins;
    recipientWallet: address;
    extra: Cell<JettonLockBox_WithdrawExtra>?;
}

/// Bounced message types this contract handles.
type JettonLockBox_BouncedMessage =
    | AskToTransfer;

struct (0x6d077f2e) JettonLockBox_Deposited {
    queryId: uint64;
    token: address;
    remoteChainSelector: uint64;
    amount: coins;
}

/// Contract initialization message.
/// @param minterAddress The jetton minter address.
/// @param walletAddress The jetton wallet address for this lockbox.
/// @param admin The admin address.
struct (0xffa6eeb9) JettonLockBox_Init {
    queryId: uint64;
    minterAddress: address;
    walletAddress: address;
    admin: address?; // msg.senderAddress as default if not provided
}

/// Initialization complete event.
/// @param minterAddress The jetton minter address.
/// @param walletAddress The jetton wallet address.
/// @param admin The admin address.
struct (0xe9f4e311) JettonLockBox_Initialized {
    queryId: uint64;
    minterAddress: address;
    walletAddress: address;
    admin: address;
}

/// Withdrawal failed error message sent to the withdraw initiator on bounce.
/// @param token The jetton minter address.
/// @param amount The amount that failed to withdraw.
/// @param recipientWallet The recipient wallet address.
struct (0x60bae556) JettonLockBox_WithdrawFailed {
    queryId: uint64;
    token: address;
    amount: coins;
    recipientWallet: address;
}

/// Union of all incoming messages this contract handles.
type JettonLockBox_InMessage =
    | JettonLockBox_Init
    | JettonLockBox_Withdraw
    | TransferNotificationForRecipient;

/// Union of all outgoing messages this contract handles.
type JettonLockBox_OutMessage =
    | JettonLockBox_Deposited
    | JettonLockBox_Initialized
    | JettonLockBox_WithdrawFailed;

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
/// @param amount The amount of tokens to withdraw. If set to max uint256, withdraws the entire balance.
/// @param recipient The address of the recipient to receive the withdrawn tokens.
struct (0x17c24002) JettonLockbox_Withdraw {
    queryId: uint64;
    token: address;
    remoteChainSelector: uint64;
    amount: coins;
    recipientWallet: address;
}

/// Union of all incoming messages this contract handles.
type JettonLockbox_InMessage =
    | TransferNotificationForRecipient
    | JettonLockbox_Withdraw;

struct (0x17c24003) JettonLockbox_Deposited {
    queryId: uint64;
    token: address;
    remoteChainSelector: uint64;
    amount: coins;
}

/// Union of all outgoing messages this contract handles.
type JettonLockbox_OutMessage =
    | JettonLockbox_Deposited;

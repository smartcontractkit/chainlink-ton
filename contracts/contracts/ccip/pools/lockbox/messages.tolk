// SPDX-License-Identifier: BUSL-1.1
/// JettonLockBox message types for deposit, withdrawal, and initialization.

import "../../../lib/jetton/messages"

/// Embedded in a jetton transfer's forwardPayload to identify the deposit context.
/// The lockbox extracts this from `TransferNotificationForRecipient.forwardPayload` on deposit.
struct (0x9e9ec361) JettonLockBox_Deposit {
    queryId: uint64;
    /// Jetton minter address being deposited.
    token: address;
    /// Destination chain selector for cross-chain routing.
    remoteChainSelector: uint64;
    /// Expected token amount (pool should verify against the jetton notification).
    amount: coins;
    /// Optional pool-specific context forwarded back in the Deposited reply.
    context: cell?;
}

/// Extra fields for withdraw — stored in a cell ref to keep the main struct compact.
struct JettonLockBox_WithdrawExtra {
    /// Where the jetton wallet should send `ReturnExcessesBack` after the transfer.
    sendExcessesTo: address?;
    /// @dev Unused — reserved for future failure context propagation.
    failureContext: cell?;
    /// Additional TON forwarded to the recipient wallet after the transfer.
    forwardTonAmount: coins;
    /// Pool context forwarded to the recipient wallet (e.g., release context for notification back to the pool).
    forwardPayload: cell?;
}

/// Sent by an authorized caller (pool) to withdraw jettons from the lockbox.
struct (0xd065c306) JettonLockBox_Withdraw {
    queryId: uint64;
    /// Jetton minter address being withdrawn.
    token: address;
    /// Destination chain selector for cross-chain routing.
    remoteChainSelector: uint64;
    /// Amount of jetons to send to the recipient.
    amount: coins;
    /// Target jetton wallet address.
    recipientWallet: address;
    /// Optional extra fields (sendExcessesTo routing, forwardTonAmount, forwardPayload).
    extra: Cell<JettonLockBox_WithdrawExtra>?;
}

/// Bounced message types handled by `onBouncedMessage`.
type JettonLockBox_BouncedMessage =
    | AskToTransfer;

/// Reply sent to the deposit initiator after a successful deposit.
struct (0x6d077f2e) JettonLockBox_Deposited {
    queryId: uint64;
    token: address;
    depositor: address;
    amount: coins;
    context: cell?;
}

/// One-time init message — sets jetton addresses and grants admin role.
/// @dev Sent during deployment with stateInit. If `admin` is null, the sender becomes admin.
struct (0xffa6eeb9) JettonLockBox_Init {
    queryId: uint64;
    /// Jetton minter address.
    minterAddress: address;
    /// Jetton wallet address for this lockbox.
    walletAddress: address;
    /// Admin address (defaults to msg.senderAddress if null).
    admin: address?;
}

/// Sent to the deployer after successful initialization.
struct (0xe9f4e311) JettonLockBox_Initialized {
    queryId: uint64;
    minterAddress: address;
    walletAddress: address;
    admin: address;
}

/// Sent to the withdraw caller when a bounced jetton transfer indicates failure.
/// @dev The lockbox can't distinguish between jetton-level rejection and insufficient balance — both produce bounces.
struct (0x60bae556) JettonLockBox_WithdrawFailed {
    queryId: uint64;
    token: address;
    amount: coins;
    recipientWallet: address;
    context: cell?;
}

/// All recognized incoming message types.
type JettonLockBox_InMessage =
    | JettonLockBox_Init
    | JettonLockBox_Withdraw
    | TransferNotificationForRecipient;

/// All outgoing message types.
type JettonLockBox_OutMessage =
    | JettonLockBox_Deposited
    | JettonLockBox_Initialized
    | JettonLockBox_WithdrawFailed;

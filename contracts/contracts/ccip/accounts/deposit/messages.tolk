// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"

/// Activates the account; only accepted from the owner. Answered to the owner with
/// `DepositAccount_Initialized` once the account knows its jetton wallet, or
/// `DepositAccount_WalletUnavailable` when the token can't report it.
///
/// @dev Deployment is `Deployable_Initialize` (installs code/data) followed by this init. Every
///      init is answered, so re-sending it to a deployed account confirms it exists.
///      The first init waits for the token's TEP-89 response; another init arriving meanwhile
///      bounces with `InitPending`, so concurrent first inits to the same account fail all but
///      one and must be retried by the owner.
struct (0x6890a205) DepositAccount_Init {
    queryId: uint64;
    /// Echoed back in the reply.
    context: cell?;
}

struct (0x784d98e9) DepositAccount_Initialized {
    queryId: uint64;
    context: cell?;
}

struct (0x9293d68e) DepositAccount_WalletUnavailable {
    queryId: uint64;
    context: cell?;
}

/// A jetton transfer notification received by the account, forwarded to the account's `user`, or
/// to the `DepositAccount_Notify` target when the transfer carries one.
struct (0xb4fe5c0c) DepositAccount_ForwardNotification {
    notification: Cell<TransferNotificationForRecipient>;
}

/// Routing envelope placed as a jetton transfer's forward payload, directly or inside a
/// `Jetton_ForwardPayloadWrap`: the account forwards the notification to `notify`.
///
/// @dev Only honored for transfers from the account's learned jetton wallet. The rest of the
///      notification is untrusted: `notify` must authenticate the transfer initiator itself.
struct (0x88e0ef3e) DepositAccount_Notify {
    notify: address;
}

/// Sent by a beneficiary to transfer jettons out of the account's jetton wallet.
struct (0x1936d112) DepositAccount_Withdraw {
    queryId: uint64;
    ask: AskToTransfer;
}

/// Sent to the withdraw requester when its `AskToTransfer` bounced and the jettons stayed in the
/// account.
///
/// @dev `user` and `token` are self-reported: the recipient must re-derive the account address
///      from them and match it against the sender before believing them.
struct (0xa51b6cba) DepositAccount_WithdrawFailed {
    queryId: uint64;
    user: address;
    token: address;
    /// Jetton wallet the failed `ask` was sent to.
    walletAddress: address;
    request: Cell<DepositAccount_Withdraw>;
}

/// Outgoing messages that can bounce back into the account.
type DepositAccount_BouncedMessage =
    | AskToTransfer
    | RequestWalletAddress;

type DepositAccount_InMessage =
    | DepositAccount_Init
    | DepositAccount_Withdraw
    | TransferNotificationForRecipient
    | ResponseWalletAddress;

type DepositAccount_OutMessage =
    | DepositAccount_ForwardNotification
    | DepositAccount_Initialized
    | DepositAccount_WalletUnavailable
    | DepositAccount_WithdrawFailed
    | AskToTransfer
    | RequestWalletAddress;

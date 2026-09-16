// SPDX-License-Identifier: BUSL-1.1

import "../../../lib/jetton/messages"
import "../../../lib/jetton/jetton_client"

/// Sent by the owner (or the Router) to activate the account and configure its jetton identity.
/// @dev Sets `jettonClient` and derives the account's own wallet. Sender must be owner or beneficiary.
struct (0xa5f69550) OnRampAccount_Init {
    queryId: uint64;
    jettonClient: JettonClient;
}

/// Acknowledgement returned to the initiator after the account is configured.
/// Carries the derived account wallet so the caller can route notifications.
struct (0x2efdb932) OnRampAccount_InitAck {
    queryId: uint64;
    jettonWallet: address;
}

/// Sent by `owner` or `beneficiary` (Router) to transfer jettons from this account's
/// jetton wallet to an external recipient (e.g. a token pool).
/// @dev This is the same primitive used by `OffRampAccount_Withdraw`; the Router uses it
/// to move deposited funds into a token pool to complete a CCIP send.
struct (0x12b3afbb) OnRampAccount_Withdraw {
    queryId: uint64;
    /// Jetton wallet address to send the AskToTransfer to.
    walletAddress: address;
    /// Jetton transfer parameters (amount, recipient, forward payload, etc.).
    ask: AskToTransfer;
}

/// Result sent back to the request issuer (owner or beneficiary) after a successful
/// `OnRampAccount_Withdraw`. Routing it through a wallet round-trip guarantees the
/// jettons actually left before funds are considered spent.
struct (0xa855eda2) OnRampAccount_WithdrawAck {
    queryId: uint64;
}

/// All recognized incoming message types.
/// @dev Jetton deposit notifications (`TransferNotificationForRecipient`) are matched
/// explicitly in the contract; they are not part of this union to keep it concise.
type OnRampAccount_InMessage =
    | OnRampAccount_Init
    | OnRampAccount_Withdraw
    | TransferNotificationForRecipient;

/// All outgoing message types this contract may produce.
type OnRampAccount_OutMessage =
    | OnRampAccount_InitAck
    | OnRampAccount_WithdrawAck
    | AskToTransfer;

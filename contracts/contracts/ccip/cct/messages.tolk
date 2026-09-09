// SPDX-License-Identifier: MIT
// Imported from https://github.com/ton-blockchain/tolk-bench/blob/57e1009743bfc19748caa95d76180d9e9793e4c5/contracts_Tolk/03_notcoin/messages.tolk

/// CCT-specific `AskToBurn` used by CCIP burn-mint pools. Carries an optional
/// continuation `forwardPayload` so the pool can be resumed after the burn completes.
/// Uses the same opcode as the standard `AskToBurn`; only the CCT JettonWallet decodes it.
// nolint:opcode
struct (0x595f07bc) CCT_AskToBurn {
    queryId: uint64
    jettonAmount: coins
    sendExcessesTo: address?
    customPayload: cell?
    /// Optional CCIP burn continuation context. Relayed to the minter and back to the
    /// pool on `CCT_ReturnExcessesBack` so the pool can finalize the lock/burn.
    forwardPayload: cell?
}

/// CCT-specific `BurnNotificationForMinter` carrying the burn continuation
/// context forwarded from `CCT_AskToBurn`. Uses the same opcode as the standard one.
/// Only the CCT JettonMinter decodes it.
// nolint:opcode
struct (0x7bdd97de) CCT_BurnNotificationForMinter {
    queryId: uint64
    jettonAmount: coins
    burnInitiator: address
    sendExcessesTo: address?
    /// Forwarded from `CCT_AskToBurn.forwardPayload`; attached to `CCT_ReturnExcessesBack`.
    forwardPayload: cell? = null
}

/// Message sent to the pool to return excesses back, extended with
/// initiator address to allow the pool to verify the identity of the sender.
/// Optionally carries a continuation `forwardPayload` on the CCIP burn path.
// nolint:opcode
struct (0xd53276db) CCT_ReturnExcessesBack {
    queryId: uint64
    initiator: address
    /// CCIP burn continuation context (from `CCT_BurnNotificationForMinter`). Null on
    /// pure excess-return signals (e.g. mint/transfer paths), which the pool ignores.
    forwardPayload: cell? = null
}

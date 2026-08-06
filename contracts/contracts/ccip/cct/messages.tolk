// SPDX-License-Identifier: MIT
// Imported from https://github.com/ton-blockchain/tolk-bench/blob/57e1009743bfc19748caa95d76180d9e9793e4c5/contracts_Tolk/03_notcoin/messages.tolk

/// @notice Message sent to the pool to return excesses back, extended with
/// initiator address to allow the pool to verify the identity of the sender.
// nolint:opcode
struct (0xd53276db) CCT_ReturnExcessesBack {
    queryId: uint64
    initiator: address
}

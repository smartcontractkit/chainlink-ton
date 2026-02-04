// SPDX-License-Identifier: BUSL-1.1

// nolint:opcode
struct (0x7362d09c) Common_JettonTransferNotification {
    queryId: uint64;
    amount: coins;
    sender: address;
    forwardPayload: cell?; // could also be RemainingBitsAndRefs
}

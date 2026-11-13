// SPDX-License-Identifier: BUSL-1.1
struct RampMessageHeader { // 512
    messageId: uint256;
    sourceChainSelector: uint64;
    destChainSelector: uint64;
    sequenceNumber: uint64;
    nonce: uint64;
}

/// The header fields that identify a message on the ExecutionStateChanged event. Carried inline
/// (instead of a RampMessageHeader cell) by the messages that end an execution attempt.
struct RampMessageRef { // 384
    messageId: uint256;
    sourceChainSelector: uint64;
    sequenceNumber: uint64;
}

fun RampMessageHeader.toRef(self): RampMessageRef {
    return {
        messageId: self.messageId,
        sourceChainSelector: self.sourceChainSelector,
        sequenceNumber: self.sequenceNumber,
    };
}

const LEAF_DOMAIN_SEPARATOR: bits256 = "0000000000000000000000000000000000000000000000000000000000000000".hexToSlice() as bits256;

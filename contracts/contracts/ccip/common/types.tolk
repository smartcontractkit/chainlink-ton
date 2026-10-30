// SPDX-License-Identifier: BUSL-1.1
struct RampMessageHeader { // 512
    messageId: uint256;
    sourceChainSelector: uint64;
    destChainSelector: uint64;
    sequenceNumber: uint64;
    nonce: uint64;
}

const LEAF_DOMAIN_SEPARATOR: bits256 = "0000000000000000000000000000000000000000000000000000000000000000".hexToSlice() as bits256;

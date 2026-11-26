// SPDX-License-Identifier: MIT
import "../../ccip/lib/finality_codec.tolk"

contract TestLibFinalityCodec {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.0.0"
    description: "link.chain.ton.test.lib.FinalityCodec"
}

// Test wrapper for FinalityCodec functions
fun onInternalMessage(in: InMessage) {
    // ignore empty messages, "wrong opcode" for others
    assert (in.body.isEmpty()) throw (0xFFFF)
}

get fun get_encodeBlockDepth(blockDepth: uint16): uint32 {
    return FinalityCodec_encodeBlockDepth(blockDepth);
}

get fun get_encodeBlockDepthAndSafeFlag(blockDepth: uint16): uint32 {
    return FinalityCodec_encodeBlockDepthAndSafeFlag(blockDepth);
}

get fun validateRequestedFinality(encodedFinality: uint32): uint32 {
    FinalityCodec_validateRequestedFinality(encodedFinality);
    return encodedFinality;
}

get fun ensureRequestedFinalityAllowed(requestedFinality: uint32, allowedFinality: uint32): uint32 {
    FinalityCodec_ensureRequestedFinalityAllowed(requestedFinality, allowedFinality);
    return requestedFinality;
}

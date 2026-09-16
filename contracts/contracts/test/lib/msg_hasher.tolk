import "../../ccip/common/types"
import "../../ccip/offramp/types"
import "../../ccip/onramp/types"

// SPDX-License-Identifier: MIT

contract TestMsgHasher {
    author: "SmartContract Chainlink Limited SEZC"
    version: "1.0.0"
    description: "link.chain.ton.test.lib.MsgHasher"
    storage: Storage
}

struct Storage {}

// Test wrapper for math library functions
fun onInternalMessage(in: InMessage) {
    // ignore empty messages, "wrong opcode" for others
    assert (in.body.isEmpty()) throw 0xFFFF
}

get fun getAny2TVMRampMessageID(msg: Cell<Any2TVMRampMessage>, metadataHash: int): (int) {
    val decodedMsg = msg.load();
    return decodedMsg.generateMessageId(metadataHash)
}

get fun getTVM2AnyRampMessageID(msg: Cell<TVM2AnyRampMessage>, metadataHash: int): (int) {
    val decodedMsg = msg.load();
    return decodedMsg.generateMessageId(metadataHash)
}

get fun getAny2TVMV1MetadataHash(sourceChainSelector: uint64, destChainSelector: uint64, onRamp: Cell<CrossChainAddress>): (int) {
    return Any2TVMMessageV1Metadata {
        sourceChainSelector,
        destChainSelector,
        onRamp,
    }.toCell().hash()
}

get fun getTVM2AnyV1MetadataHash(sourceChainSelector: uint64, destChainSelector: uint64, onRamp: address): (int) {
    return TVM2AnyRampMessageV1Metadata {
        sourceChainSelector,
        destChainSelector,
        onRamp,
    }.toCell().hash()
}

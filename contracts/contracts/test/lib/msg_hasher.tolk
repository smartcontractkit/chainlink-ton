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

// SPDX-License-Identifier: BUSL-1.1
tolk 1.4.1

import "lib"
import "messages"
import "types"

contract ContextExecutor {
    author: "SmartContract Chainlink Limited SEZC"
    version: "0.1.0"
    description: "link.chain.ton.ccip.ContextExecutor"

    // TODO: generic not supported here
    storage: ContextExecutor_Data<cell>
    incomingMessages: ContextExecutor_InMessage<cell>
}

fun onInternalMessage(in: InMessage) {
	var executor = ContextExecutor<cell>.load();
    val handled = executor.onInternalMessage(ContextExecutor_InMessageForward {
        senderAddress: in.senderAddress,
        valueCoins: in.valueCoins,
        valueExtra: in.valueExtra,
        originalForwardFee: in.originalForwardFee,
        createdLt: in.createdLt,
        createdAt: in.createdAt,
        body: in.body.toCell(),
    });

    if (handled) {
        executor.store();
        return;
    }

    assert (in.body.isEmpty()) throw 0xFFFF;
}

get fun typeAndVersion(): (slice, slice) {
    return ("link.chain.ton.ccip.ContextExecutor".literalSlice(), "0.1.0".literalSlice());
}

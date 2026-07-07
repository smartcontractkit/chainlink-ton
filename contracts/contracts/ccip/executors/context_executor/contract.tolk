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
    outgoingMessages: ContextExecutor_OutMessage<cell>
}

@inline
fun ContextExecutor_Data<T>.fromContractData() {
	return ContextExecutor_Data<T>.fromCell(contract.getData());
}

@inline
fun ContextExecutor_Data<T>.storeAsContractData(self) {
	contract.setData(self.toCell());
}

@inline
fun ContextExecutor<T>.load(): ContextExecutor<T> {
	return ContextExecutor<T> {
        data: ContextExecutor_Data<T>.fromContractData(),
    };
}

fun ContextExecutor<T>.store(self) {
	self.data.storeAsContractData();
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

get fun id(): uint64 {
    return ContextExecutor<cell>.load().data.id;
}

get fun owner(): address {
    return ContextExecutor<cell>.load().data.owner;
}

get fun context(): Cell<cell> {
    return ContextExecutor<cell>.load().data.context;
}

get fun forwardFrom(): array<address> {
    return ContextExecutor<cell>.load().data.forwardFrom;
}

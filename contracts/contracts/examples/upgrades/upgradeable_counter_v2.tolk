import "./upgradeable_counter.tolk";
import "./upgradeable_counter_v1_storage.tolk";
import "./upgradeable_counter_v2_storage.tolk";

type IncomingMessage = Step;

fun loadData() {
    return StorageV2.fromCell(contract.getData());
}

fun saveData(data: StorageV2) {
    contract.setData(data.toCell());
}

fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs = msgFull.beginParse();
    val flags = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { // ignore all bounced messages
        return;
    }
    
    if (upgradeableCounter$handleMessage(myBalance, msgValue, msgFull, msgBody, migrate)) {
        return;
    }

    val msg = IncomingMessage.fromSlice(msgBody);  // 63 error code is thrown if the message opcode is unknown

    match (msg) {
        Step => {
            /// Instructs the contract to step the counter.
            var storage = loadData();
            storage.value -= 1;
            saveData(storage);
        }
    }
}

/// Gets the current counter value.
get value(): int {
    val storage = loadData();
    return storage.value;
}

@method_id(1666)
fun migrate(c: cell): cell {
    // Parse it as StorageV1
    var oldStorage = StorageV1.fromCell(c);
    // Create new StorageV2 with the old value and id
    var newStorage = StorageV2{
        value: oldStorage.value as uint64,
        id: oldStorage.id,
    };
    return newStorage.toCell();
}

const version= "2.0.0";

get type_and_version(): cell {
    return upgradeableCounter$type_and_version(version);
}
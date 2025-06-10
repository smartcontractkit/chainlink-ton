import "./upgradeable_counter.tolk";
import "./upgradeable_counter_v1_storage.tolk";
import "./upgradeable_counter_v2_storage.tolk";

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

    if (upgradeableCounter$handleMessage(myBalance, msgValue, msgFull, msgBody, migrateStorage, step)) {
        return;
    }
}

fun step(queryId: uint64) {
    /// Instructs the contract to step the counter.
    var storage = loadData();
    storage.value -= 1;
    saveData(storage);
}

/// Gets the current counter value.
get value(): int {
    val storage = loadData();
    return storage.value;
}

@method_id(1000)
fun migrateStorage(c: cell): cell {
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
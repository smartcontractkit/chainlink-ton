import "./upgradeable_counter.tolk";
import "./upgradeable_counter_v1_storage.tolk";

fun loadData() {
    return StorageV1.fromCell(contract.getData());
}

fun saveData(data: StorageV1) {
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
    storage.value += 1;
    saveData(storage);
}

/// Gets the current counter value.
get value(): int {
    val storage = loadData();
    return storage.value;
}

@method_id(1000)
fun migrateStorage(c: cell): cell { return beginCell().endCell(); }

const version= "1.0.0";

get type_and_version(): cell {
    return upgradeableCounter$type_and_version(version);
}
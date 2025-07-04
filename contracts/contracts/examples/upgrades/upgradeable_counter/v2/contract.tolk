import "../../../../lib/utils.tolk";
import "../shared.tolk";
import "./storage.tolk";
import "../v1/storage.tolk";

type IncomingMessage = Step;

fun loadData() {
    return StorageV2.fromCell(contract.getData());
}

fun saveData(data: StorageV2) {
    contract.setData(data.toCell());
}

const versionStr = "2.0.0";

fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs = msgFull.beginParse();
    val flags = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { // ignore all bounced messages
        return;
    }

    var storage = loadData();
    var handled = storage.ownable2Step.onInternalMessage(myBalance, msgValue, msgFull, msgBody);

    if (handled) {
        saveData(storage);
        return;
    }

    val this = UpgradeableCounter{
        versionStr,
        version,
        migrate,
        ownable2Step: storage.ownable2Step,
    };

    
    if (this.onInternalMessage(myBalance, msgValue, msgFull, msgBody)) {
        return;
    }

    val msg = IncomingMessage.fromSlice(msgBody);  // 63 error code is thrown if the message opcode is unknown

    match (msg) {
        Step => {
            /// Instructs the contract to step the counter.
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

/// Gets the current owner of the contract.
get owner(): address {
    val storage = loadData();
    return storage.ownable2Step.get_owner();
}

/// Gets the pending owner of the contract, if any.
get pendingOwner(): address? {
    val storage = loadData();
    return storage.ownable2Step.get_pendingOwner();
}

@method_id(1000)
fun migrate(storage: cell): cell {
    // Parse it as StorageV1
    var oldStorage = StorageV1.fromCell(storage);
    // Create new StorageV2 with the old value and id
    var newStorage = StorageV2{
        value: oldStorage.value as uint64,
        id: oldStorage.id,
        ownable2Step: oldStorage.ownable2Step,
    };
    return newStorage.toCell();
}
@method_id(1001)
fun version(): slice { return versionStr; }

get typeAndVersion(): (slice, slice) {
    val storage = loadData();
    val this = UpgradeableCounter{
        versionStr,
        version,
        migrate,
        ownable2Step: storage.ownable2Step,
    };
    return this.typeAndVersion();
}
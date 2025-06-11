import "../shared.tolk";
import "./storage.tolk";

type IncomingMessage = Step;

fun loadData() {
    return StorageV1.fromCell(contract.getData());
}

fun saveData(data: StorageV1) {
    contract.setData(data.toCell());
}

const versionStr = "1.0.0";

fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    val upgradeable = Upgradeable{migrateStorage, version};
    val upgradeableCounter = UpgradeableCounter{upgradeable, versionStr};

    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var cs = msgFull.beginParse();
    val flags = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { // ignore all bounced messages
        return;
    }
    
    if (upgradeableCounter.onInternalMessage(myBalance, msgValue, msgFull, msgBody)) {
        return;
    }

    val msg = IncomingMessage.fromSlice(msgBody);  // 63 error code is thrown if the message opcode is unknown

    match (msg) {
        Step => {
            /// Instructs the contract to step the counter.
            var storage = loadData();
            storage.value += 1;
            saveData(storage);
        }
    }
}

/// Gets the current counter value.
get value(): int {
    val storage = loadData();
    return storage.value;
}

@method_id(1000)
fun migrateStorage(c: cell): cell { return beginCell().endCell(); }
@method_id(1001)
fun version(): cell { return beginCell().storeSlice(versionStr).endCell(); }

get typeAndVersion(): cell {
    val upgradeable = Upgradeable{migrateStorage, version};
    val upgradeableCounter = UpgradeableCounter{upgradeable, versionStr}; // This is repeated because we cannot declare immutable variables (val) globally in Tolk
    return upgradeableCounter.typeAndVersion();
}
import "../../../../lib/common/message_flags.tolk";
import "../shared.tolk";
import "./storage.tolk";

type IncomingMessage = SwitchLock;

fun loadData() {
    return StorageV1.fromCell(contract.getData());
}

fun saveData(data: StorageV1) {
    contract.setData(data.toCell());
}

const versionStr = "1.0.0";

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
    val this = UpgradeableWithLock{
        versionStr,
        version,
        migrateStorage,
        locked: storage.locked,
    };
    
    if (this.onInternalMessage(myBalance, msgValue, msgFull, msgBody)) {
        return;
    }

    val msg = IncomingMessage.fromSlice(msgBody);  // 63 error code is thrown if the message opcode is unknown

    match (msg) {
        SwitchLock => {
            /// Instruct the contract to switch the lock state.
            var storage = loadData(); // TODO figure out how to avoid loading storage twice (memoization?)
            if (storage.locked) {
                storage.locked = false;
            } else {
                storage.locked = true;
            }
            saveData(storage);
        }
    }
}

/// Gets the current counter value.
get value(): bool {
    val storage = loadData();
    return storage.locked;
}

@method_id(1000)
fun migrateStorage(c: cell): cell { return c; }
@method_id(1001)
fun version(): slice { return versionStr; }

get typeAndVersion(): (slice, slice) {
    val this = UpgradeableWithLock{
        versionStr,
        version,
        migrateStorage,
        locked: loadData().locked,
    };
    return this.typeAndVersion();
}
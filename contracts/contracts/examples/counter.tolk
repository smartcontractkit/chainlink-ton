import "../lib/upgrades/type_and_version.tolk";

// Counter contract (Tact example)
//
// --- Message Definitions ---
//
// Messages correspond to FunC/Tolk opcodes for setter operations.
//
// Opcodes are explicitly set to match the original constants.
//
struct (0x00000004) SetCount {
    queryId: uint64; // Standard query_id field
    newCount: uint32; // Argument for the operation
}

struct Storage {
    id: uint32;
    value: uint32;
}

type IncomingMessage = SetCount;

fun loadData() {
    return Storage.fromCell(contract.getData());
}

fun saveData(data: Storage) {
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

    val msg = IncomingMessage.fromSlice(msgBody);  // 63 error code is thrown if the message opcode is unknown

    match (msg) {
        SetCount => {
            /// Instructs the contract to step the counter.
            var storage = loadData();
            storage.value = msg.newCount;
            saveData(storage);
        }
    }
}

/// Gets the current counter value.
get value(): int {
    val storage = loadData();
    return storage.value;
}

get id(): int {
    val storage = loadData();
    return storage.id;
}

get typeAndVersion(): cell {
    return TypeAndVersion {
        typeStr: "com.chainlink.ton.examples.Counter",
        versionStr: "1.0.0",
    }.typeAndVersion();
}
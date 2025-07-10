import "@stdlib/common.tolk";
import "../lib/upgrades/type_and_version.tolk";
import "../lib/utils.tolk";

/// Counter contract (Tolk example)

/// Message to set the counter value.
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

fun onInternalMessage(in: InMessage) {
    val msg = lazy IncomingMessage.fromSlice(in.body);  // 63 error code is thrown if the message opcode is unknown
    match (msg) {
        SetCount => {
            /// Instructs the contract to step the counter.
            var storage = loadData();
            storage.value = msg.newCount;
            saveData(storage);
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

/// Gets the current counter value.
get fun value(): int {
    val storage = loadData();
    return storage.value;
}

/// Gets the current id of the contract.
get fun id(): int {
    val storage = loadData();
    return storage.id;
}

/// Gets the current type and version of the contract.
get fun typeAndVersion(): (slice, slice) {
    return TypeAndVersion {
        typeStr: "com.chainlink.ton.examples.Counter",
        versionStr: "1.0.0",
    }.typeAndVersion();
}

import "@stdlib/common.tolk"
import "../../lib/upgrades/type_and_version.tolk"
import "../../lib/utils.tolk"

/// Counter contract + event emission (Tolk example)
/// Message to set the counter value.
struct (0x00000004) SetCount {
    queryId: uint64 // Standard query_id field
    newCount: uint32 // Argument for the operation
}

/// Message to increase the counter value.
struct (0x10000005) IncreaseCount {
    queryId: uint64 // Standard query_id field
}

/// Event Topics
const COUNT_SET_TOPIC = 0x0766fed0 // crc32("CountSet")
const COUNT_INCREASED_TOPIC = 0x1947b328 // crc32("CountIncreased")

/// Event emitted when the counter is set
struct CountSet {
    id: uint32
    value: uint32
}

/// Event emitted when the counter is increased
struct CountIncreased {
    id: uint32
    value: uint32
}

struct Storage {
    id: uint32
    value: uint32
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

type Msg = SetCount | IncreaseCount

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body); // 63 error code is thrown if the message opcode is unknown
    match (msg) {
        SetCount => {
            /// Instructs the contract to set the counter.
            var st = lazy Storage.load();
            st.value = msg.newCount;
            st.store();
            emit<CountSet>(COUNT_SET_TOPIC, { id: st.id, value: st.value });
        }
        IncreaseCount => {
            /// Instructs the contract to increase the counter.
            var st = lazy Storage.load();
            st.value = st.value + 1;
            st.store();
            emit<CountIncreased>(COUNT_INCREASED_TOPIC, { id: st.id, value: st.value });
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

/// Gets the current id of the contract.
get fun id(): int {
    val storage = Storage.load();
    return storage.id;
}

/// Gets the current counter value.
get fun value(): int {
    val storage = Storage.load();
    return storage.value;
}

/// Gets the current type and version of the contract.
get fun typeAndVersion(): (slice, slice) {
    return TypeAndVersion { typeStr: "com.chainlink.ton.examples.Counter", versionStr: "1.0.0" }
        .typeAndVersion();
}

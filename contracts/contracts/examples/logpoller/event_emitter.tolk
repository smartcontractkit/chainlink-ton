// Note: Test counter event emitter for logpoller TON>EVM tests
import "../../lib/utils.tolk";

// events
const COUNTER_INCREASED_TOPIC = 0x1234
const COUNTER_RESET_TOPIC = 0x5678

struct CounterIncreased {
    id: uint64
    counter: uint64
}

struct CounterReset {
    id: uint64
}

struct Storage {
    id: uint64
    counter: uint64
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}
struct (0x7e8764ef) IncreaseCounter {
    queryId: uint64
}
struct (0x3a752f06) ResetCounter {
    queryId: uint64
}

type Msg = IncreaseCounter | ResetCounter

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        IncreaseCounter => {
            var st = lazy Storage.load();
            st.counter = st.counter + 1;
            st.store();

            emit<CounterIncreased>(COUNTER_INCREASED_TOPIC, { id: st.id, counter: st.counter });
        }
        ResetCounter => {
            var st = lazy Storage.load();
            st.counter = 0;
            st.store();

            emit<CounterReset>(COUNTER_RESET_TOPIC, { id: st.id });
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        }
    }
}

get fun id(): uint64 {
    var st = lazy Storage.load();
    return st.id;
}

get fun counter(): uint64 {
    var st = lazy Storage.load();
    return st.counter;
}

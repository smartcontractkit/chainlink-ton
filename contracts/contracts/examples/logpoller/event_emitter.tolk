// Note: Test CCIPMessageSent event emitter for logpoller TON>EVM tests
import "../../lib/utils.tolk";

// events
const COUNTER_INCREASED_TOPIC: int = 0x1234;
struct CounterIncreased {
    selector: uint64;
    counter: uint64;
}

struct Storage {
    selector: uint64;
    counter: uint64;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

// msg
struct (0x00001234) IncreaseCounter {}

type Msg = IncreaseCounter;

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        IncreaseCounter => { 
            var st = lazy Storage.load();
                st.counter = st.counter + 1;
                st.store();

                // Emit external log message for CCIPSend
                emit<CounterIncreased>(COUNTER_INCREASED_TOPIC, {
                    selector: st.selector,
                    counter: st.counter
                });
         }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF // ignore empty messages, "wrong opcode" for others
        }
    }
}

get fun selector(): uint64 {
    var st = lazy Storage.load();
    return st.selector;
}

get fun counter(): uint64 {
    var st = lazy Storage.load();
    return st.counter;
}
// Note: Test CCIPMessageSent event emitter for logpoller TON>EVM tests
import "../../lib/utils.tolk";

// events
const CCIP_MESSAGE_SENT_TOPIC: int = 0x99; // for easier indexing
struct CCIPMessageSent {
    destChainSelector: uint64;
    sequenceNumber: uint64;
}

struct Storage {
    destChainSelector: uint64;
    sequenceNumber: uint64;
}

fun Storage.load(): Storage {
    return Storage.fromCell(contract.getData());
}

fun Storage.store(self) {
    return contract.setData(self.toCell());
}

// msgs
struct (0x00000001) CCIPSend {
    queryId: uint64;
}

struct (0x00000002) Reset {
    queryId: uint64;
}

type Msg = CCIPSend | Reset;
// TODO: this is not working
fun onInternalMessage(in: InMessage) {
    var st = lazy Storage.load();
    st.sequenceNumber = 2;
    st.store();

    // val msg = lazy Msg.fromSlice(in.body);
    // match (msg) {
    //     CCIPSend => { onSend(msg) }
    //     Reset => { onReset(msg) }
    //     else => {
    //         assert (in.body.isEmpty()) throw 0xFFFF // ignore empty messages, "wrong opcode" for others
    //     }
    // }
}

fun onSend(payload: CCIPSend) {
    var st = lazy Storage.load();
    st.sequenceNumber = st.sequenceNumber + 1;
    st.store();

    // Emit external log message for CCIPSend
    emit<CCIPMessageSent>(CCIP_MESSAGE_SENT_TOPIC, {
        destChainSelector: st.destChainSelector,
        sequenceNumber: st.sequenceNumber
    });
    
}

fun onReset(payload: Reset) {
    var st = lazy  Storage.load();
    st.sequenceNumber = 0;
    st.store();
    // no event, validate with query
}

get fun destChainSelector(): uint64 {
    var st = lazy Storage.load();
    return st.destChainSelector;
}

get fun sequenceNumber(): uint64 {
    var st = lazy Storage.load();
    return st.sequenceNumber;
}
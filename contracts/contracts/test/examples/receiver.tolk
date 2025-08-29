import "../../ccip/types";
import "../../lib/utils";

//crc32('Receiver_CCIPMessageReceived')
const RECEIVED_MESSAGE = 0xc5a40ab3;

struct Storage {
    offRamp: address; //TODO: should be router?
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

struct CCIPMessageReceived {
    message: Any2TVMMessage
}

type Msg = CCIPReceive;

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        CCIPReceive => {
            assert(in.senderAddress == Storage.load().offRamp) throw 0x7777;
            emit(RECEIVED_MESSAGE, CCIPMessageReceived{
                message: msg.message,
            });
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

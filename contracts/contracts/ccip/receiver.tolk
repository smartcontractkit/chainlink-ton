import "types";

struct (0x00000040) Hello {}

type Msg = CcipReceive | Hello;

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        CcipReceive => {debug.printString("received ccip message")}
        Hello => {debug.printString("hello")}
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

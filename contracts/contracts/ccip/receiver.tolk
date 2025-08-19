import "types";

struct Storage {
    id: uint64
}

struct (0x00000040) Hello {}

fun onInternalMessage(in: InMessage) {
    val msg = CcipReceive.fromSlice(in.body);
    val helloMsg = Hello.fromCell(msg.message.data);
    debug.printString("hello");
}

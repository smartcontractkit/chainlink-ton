tolk 1.0

struct (0x00000001) SelfDestruct {
    queryId: uint64,
}

type SelfDestruct_InMessage = SelfDestruct;

fun onInternalMessage(in: InMessage) {
    val msg = lazy SelfDestruct_InMessage.fromSlice(in.body);
    match (msg) {
        SelfDestruct => {
            val reply = createMessage({
                bounce: false,
                value: 0,
                dest: in.senderAddress,
                body: beginCell().endCell(),
            });
            reply.send(SEND_MODE_CARRY_ALL_BALANCE + SEND_MODE_DESTROY);
        }
        else => {
            assert (in.body.isEmpty()) throw 0xFFFF;
        },
    };
}
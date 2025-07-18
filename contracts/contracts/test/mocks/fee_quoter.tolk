import "../../ccip/types.tolk"


type Msg = UpdatePrices;

fun onInternalMessage(in: InMessage) {
    val msg = lazy Msg.fromSlice(in.body);
    match (msg) {
        UpdatePrices => { // Mock UpdatePrices Message handler
        }
	else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}


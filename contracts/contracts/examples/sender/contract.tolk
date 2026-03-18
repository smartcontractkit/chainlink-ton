import "../../ccip/router/messages.tolk"


struct (0x00000001) CCIPSender_RelayCCIPSend {
	routerAddress: address,
	valueToAttach: coins,
        message: Cell<Router_CCIPSend>
}

type CCIPSender_InMessage = CCIPSender_RelayCCIPSend | Router_CCIPSendACK | Router_CCIPSendNACK;

fun onInternalMessage(in: InMessage) {
    val msg = lazy CCIPSender_InMessage.fromSlice(in.body);
    match(msg) {
        CCIPSender_RelayCCIPSend => {
            onRelayCCIPSend(msg)
        }
        Router_CCIPSendACK => {
            // Message was sent succesfully! Handle it according to your product logic. 
            return; 
        }
        Router_CCIPSendNACK => {
            // CCIPSend failed somewhere along the trace.
            // Remaining value is attached and you can access the exit code in the message.
            throw msg.error;
        }
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

fun onRelayCCIPSend(msg: CCIPSender_RelayCCIPSend) {
    val messageBody = Router_CCIPSend.fromCell(msg.message);
    val message = createMessage({
        bounce: true,
        value: msg.valueToAttach,
        dest: msg.routerAddress,
        body: messageBody,
    });
    message.send(SEND_MODE_REGULAR);
}
 

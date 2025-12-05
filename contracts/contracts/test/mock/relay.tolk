tolk 1.2

struct (0x527146b1) Relay_Send {
    bounce: bool,
    value: coins,
    to: address,
    body: cell,
    sendMode: uint8,
}

fun onInternalMessage(in: InMessage) {
    if (in.body.isEmpty()) {
        return;
    }
    val msg = Relay_Send.fromSlice(in.body);
    val relayMsg = createMessage({
        bounce: msg.bounce,
        value: msg.value,
        dest: msg.to,
        body: msg.body,
    });
    relayMsg.send(msg.sendMode);
}
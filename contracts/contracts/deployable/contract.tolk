import "types"

fun onInternalMessage(in: InMessage) {
    val st = Deployable<RemainingBitsAndRefs>.load();
    assert(in.senderAddress == st.owner) throw ERROR_NOT_OWNER;
    val msg = lazy Deployable_InMessage.fromSlice(in.body);
    match (msg) {
        Deployable_Initialize => {
            contract.setCodePostponed(msg.stateInit.code);
            contract.setData(msg.stateInit.data);
        }
        Deployable_InitializeAndExecute => {
            contract.setCodePostponed(msg.stateInit.code);
            contract.setData(msg.stateInit.data);
            val msg = createMessage({
                bounce: false,
                value: ton("0.4"), // TODO
                dest: contract.getAddress(),
                body: msg.message,
            });
            msg.send( SEND_MODE_REGULAR);
        }
    }
}

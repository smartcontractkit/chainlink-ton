import "types"

fun onInternalMessage(in: InMessage) {
    val st = Deployable<RemainingBitsAndRefs>.load();
    assert(in.senderAddress == st.owner) throw ERROR_NOT_OWNER;
    val inMsg = lazy Deployable_InMessage.fromSlice(in.body);
    match (inMsg) {
        Deployable_Initialize => {
            contract.setCodePostponed(inMsg.stateInit.code);
            contract.setData(inMsg.stateInit.data);
        }
        Deployable_InitializeAndSend => {
            contract.setCodePostponed(inMsg.stateInit.code);
            contract.setData(inMsg.stateInit.data);
            val selfMsg = createMessage({
                bounce: false,
                value: inMsg.selfMessage.value,
                dest: contract.getAddress(),
                body: inMsg.selfMessage.body,
            });
            selfMsg.send(SEND_MODE_PAY_FEES_SEPARATELY);
        }
    }
}

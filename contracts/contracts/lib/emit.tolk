/// Sends an external message with a given body.
fun emitEvent(body: cell) {
    val c = beginCell()
        .storeUint(15211807202738752817960438464513, 104)
        .storeRef(body)
        .endCell();
    sendRawMessage(c, 0);
}


// Note: Test CCIPMessageSent event emitter for logpoller PoC

import "../../lib/utils.tolk";

global ctxDestChainSelector: uint64;
global ctxSequenceNumber: uint64;

// msgs
struct (0x00000001) CCIPSend {
    queryId: uint64;
}

struct (0x00000002) Reset {
    queryId: uint64;
}

// events
const CCIP_MESSAGE_SENT_TOPIC: int = 0x99; // for easier indexing
struct CCIPMessageSent {
    destChainSelector: uint64;
    sequenceNumber: uint64;
}

// TODO: use storage instead
@inline
fun loadCtx() {
    var cs = contract.getData().beginParse();
    ctxDestChainSelector = cs.loadUint(64); 
    ctxSequenceNumber = cs.loadUint(64);
}

@inline
fun storeCtx() {
    contract.setData(
        beginCell()
        .storeUint(ctxDestChainSelector, 64)
        .storeUint(ctxSequenceNumber, 64)
        .endCell()
    );
}

type Msg = CCIPSend | Reset;

fun onInternalMessage(msgCell: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    loadCtx();

    var cs = msgCell.beginParse();
    val flags  = cs.loadMessageFlags();
    if (isMessageBounced(flags)) { return; } // ignore all bounced messages

    val msg = Msg.fromSlice(msgBody);
    match (msg) {
        CCIPSend => { onSend(msg) }
        Reset => { onReset(msg) }
    }

    storeCtx();
}

fun onSend(payload: CCIPSend) {
    ctxSequenceNumber += 1;

    // Emit external log message for CCIPSend
    emit<CCIPMessageSent>(CCIP_MESSAGE_SENT_TOPIC, {
        destChainSelector: ctxDestChainSelector,
        sequenceNumber: ctxSequenceNumber
    });
}

fun onReset(payload: Reset) {
    ctxSequenceNumber = 0;
    // no event, validate with query
}

get destChainSelector(): uint64 {
    loadCtx();
    return ctxDestChainSelector;
}

get sequenceNumber(): uint64 {
    loadCtx();
    return ctxSequenceNumber;
}
// Note: Test counter event emitter for logpoller TON>EVM tests
import "../../lib/utils.tolk";

// events
const COUNTER_INCREASED_TOPIC = 0x1234;
const COUNTER_RESET_TOPIC = 0x5678;

struct CounterIncreasedEvent {
    id: uint64;
    counter: uint64;
}

struct CounterResetEvent {
    id: uint64;
}

// opcodes
const INCREASE_COUNTER_OPCODE = 0x7e8764ef;
const RESET_COUNTER_OPCODE = 0x3a752f06;

global ctxId: uint64;
global ctxCounter: uint64;

@inline
fun loadCtx() {
    var cs = contract.getData().beginParse();
    ctxId = cs.loadUint(64);
    ctxCounter = cs.loadUint(64); 
}

@inline
fun storeCtx(){
    contract.setData(
        beginCell()
        .storeUint(ctxId, 64)
        .storeUint(ctxCounter, 64)
        .endCell()
    );
}

struct (0x7e8764ef) IncreaseCounter {
    queryId: uint64
}
struct (0x3a752f06) ResetCounter {
    queryId: uint64
}

fun onInternalMessage(msgFull: cell, msgBody: slice) {
    loadCtx();
    val op = msgBody.loadMessageOp();
    if (op == INCREASE_COUNTER_OPCODE) {
        ctxCounter += 1;
        storeCtx();
        emit<CounterIncreasedEvent>(COUNTER_INCREASED_TOPIC, {
            id: ctxId,
            counter: ctxCounter
        });
    } else if (op == RESET_COUNTER_OPCODE) {
        ctxCounter = 0;
        storeCtx();
        emit<CounterResetEvent>(COUNTER_RESET_TOPIC, {
            id: ctxId
        });
    }
}

get fun id(): uint64 {
    loadCtx();
    return ctxId;
}

get fun counter(): uint64 {
    loadCtx();
    return ctxCounter;
}
import "../../lib/utils.tolk";

// Note: Test contract for logpoller PoC
// TODO: happy to merge with other example contracts with event emit functionality
const op_reset_counter = 0x3dc2af2d;

global ctxOwnerAddress: address;
global ctxCounter: int;

// events
struct CounterResetEvent {
    timestamp: uint32;
    resetBy: address;
}

struct CounterIncrementEvent {
    timestamp: uint32;
    newValue: uint32;
    triggeredBy: address;
}

@inline
fun loadCtx() {
    var cs = contract.getData().beginParse();
    ctxOwnerAddress = cs.loadAddress(); 
    ctxCounter = cs.loadUint(32);
}

@inline
fun storeCtx() {
    contract.setData(
        beginCell()
        .storeAddress(ctxOwnerAddress)
        .storeUint(ctxCounter, 32)
        .endCell()
    );
}

fun onInternalMessage(msgFull: cell, msgBody: slice) {
    loadCtx();
    var cs = msgFull.beginParse();
    cs.loadMessageFlags();
    val sender = cs.loadAddress();

    if (sender.bitsEqual(ctxOwnerAddress)) {
        if (!msgBody.isEnd()) {
            val op = msgBody.loadMessageOp();
            if (op == op_reset_counter) {
                ctxCounter = 0;
                storeCtx();
                
                // Emit external log message for counter reset
                emit<CounterResetEvent>(1001, {
                    timestamp: blockchain.now(),
                    resetBy: sender
                });
                return;
            }
        }
    }

    ctxCounter += 1;
    storeCtx();

    // Emit external log message for counter increment
    emit<CounterIncrementEvent>(1002, {
        timestamp: blockchain.now(),
        newValue: ctxCounter,
        triggeredBy: sender
    });
}

get counter(): int {
    loadCtx();
    return ctxCounter;
}

get owner(): address {
    loadCtx();
    return ctxOwnerAddress;
}
// TODO: Test contract for logpoller example, 
// TODO: happy to merge with other example contracts with event emit functionality
const op_reset_counter = 0x3dc2af2d;

// global variables context
global ctxOwnerAddress: address;
global ctxCounter: int;

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

// Event structures for logging
struct (0x1001) CounterResetEvent {
    timestamp: uint32;
    resetBy: address;
}

struct (0x1002) CounterIncrementEvent {
    timestamp: uint32;
    newValue: uint32;
    triggeredBy: address;
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
                val resetEvent = createExternalLogMessage({
                    dest: createAddressNone(),
                    body: CounterResetEvent {
                        timestamp: blockchain.now(),
                        resetBy: sender
                        }
                    });
                resetEvent.send(SEND_MODE_REGULAR);
                return;
            }
        }
    }

    ctxCounter += 1;
    storeCtx();

    // Emit external log message for counter increment
    val incrementEvent = createExternalLogMessage({
        dest: createAddressNone(),
        body: CounterIncrementEvent {
            timestamp: blockchain.now(),
            newValue: ctxCounter,
            triggeredBy: sender
            }
        });
    incrementEvent.send(SEND_MODE_REGULAR);
}

get counter(): int {
    loadCtx();
    return ctxCounter;
}

get owner(): address {
    loadCtx();
    return ctxOwnerAddress;
}
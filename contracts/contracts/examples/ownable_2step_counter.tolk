import "./../lib/access/ownable_2step.tolk";

struct OwnableCounter {
    id: uint64;
    count: uint32;
    ownable: Ownable2Step;
}

// load contract data using auto-deserialization
fun loadData(): OwnableCounter {
    return OwnableCounter.fromCell(contract.getData());
}

// save contract data into persistent storage using auto-serialization
fun saveData(data: OwnableCounter) {
    contract.setData(data.toCell());
}

struct (0x00000001) SetCount {
    queryId: uint64;
    count: uint32;
}

type IncomingMessage = SetCount;

fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEnd()) { // ignore all empty messages
        return;
    }

    var storage = loadData();

    // Try to handle ownable_2step trait messages first
    var handled = storage.ownable.onInternalMessage(myBalance, msgValue, msgFull, msgBody);

    // | chain other trait handlers here

    if (handled) {
        // Store updates and return
        saveData(storage);
        return;
    }

    val msg = IncomingMessage.fromSlice(msgBody);

// We need to add this boilerplate to any ownable_2step contract to handle ownership transfer messages

    debug.printString("123");
    match(msg) {
        SetCount => {
            debug.printString("hola");
            var storage = loadData();

            // Ensure the sender is the owner
            var cs: slice = msgFull.beginParse();
            val flags = cs.loadMessageFlags();
            if (isMessageBounced(flags)) { // ignore all bounced messages
                return;
            }
            var sender: address = cs.loadAddress(); 
            debug.print(sender);
            storage.ownable.requireOwner(sender);

            storage.count = msg.count;
            saveData(storage);
        }        
    }
}

get counter(): uint32 {
    var storage = loadData();
    return storage.count;
}

get owner(): address {
    var storage = loadData();
    return storage.ownable.get_owner();
}

get id(): uint64 {
    var storage = loadData();
    return storage.id;
}

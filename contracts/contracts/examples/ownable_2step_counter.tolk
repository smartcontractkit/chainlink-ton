import "./../lib/access/ownable_2step.tolk";
import "./../lib/utils.tolk";

struct OwnableCounter {
    id: uint64;
    count: uint32;
    ownable: Ownable2Step;
}

// load contract data using auto-deserialization
fun OwnableCounter.load(): OwnableCounter {
    return OwnableCounter.fromCell(contract.getData());
}

// save contract data into persistent storage using auto-serialization
fun OwnableCounter.store(self) {
    contract.setData(self.toCell());
}

struct (0x00000001) SetCount {
    queryId: uint64;
    count: uint32;
}

type IncomingMessage = SetCount;

<<<<<<< HEAD
fun onInternalMessage(in: InMessage) {
    var storage = lazy OwnableCounter.load();
=======
fun onInternalMessage(myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (msgBody.isEndOfBits() && msgBody.isEndOfRefs()) { // ignore all empty messages
        return;
    }

    var storage = loadData();
>>>>>>> 59fe496 (Update contracts to tolk 1.0)

    val sender = in.senderAddress;
    // Try to handle ownable_2step trait messages first
    var handled = storage.ownable.onInternalMessage(sender, in.body);

    // | chain other trait handlers here

    if (handled) {
        // Store updates and return
        storage.store();
        return;
    }

    val msg = lazy IncomingMessage.fromSlice(in.body);

// We need to add this boilerplate to any ownable_2step contract to handle ownership transfer messages

    match(msg) {
        SetCount => {
            // Ensure the sender is the owner
            storage.ownable.requireOwner(sender);

            storage.count = msg.count;
            storage.store();
        }        
        else => {
            // ignore empty messages, "wrong opcode" for others
            assert (in.body.isEmpty()) throw 0xFFFF
        }
    }
}

get fun counter(): uint32 {
<<<<<<< HEAD
    var storage = lazy OwnableCounter.load();
=======
    var storage = loadData();
>>>>>>> 59fe496 (Update contracts to tolk 1.0)
    return storage.count;
}

get fun owner(): address {
<<<<<<< HEAD
    var storage = lazy OwnableCounter.load();
=======
    var storage = loadData();
>>>>>>> 59fe496 (Update contracts to tolk 1.0)
    return storage.ownable.get_owner();
}

get fun id(): uint64 {
<<<<<<< HEAD
    var storage = lazy OwnableCounter.load();
=======
    var storage = loadData();
>>>>>>> 59fe496 (Update contracts to tolk 1.0)
    return storage.id;
}

import "../access/ownable_2step.tact";

message SetCount {
    queryId: Int as uint64;
    newCount: Int as uint32;
}

/// Ownable Counter contract example
///
contract OwnableCounter with Ownable2Step {
    // Ownership variables, required by the Ownable2Step trait
    owner: Address;
    pendingOwner: Address?;

    id: Int as uint32;
    count: Int as uint32;

    // --- Initialization ---
    // The Ownable2Step won't force you to initialize the ownerhsip variables. It should be done manually.
    // In this example the message sender is set as the owner and the pendingOwner is set to null. But different custom logic could be implemented.
    init(id: Int, count: Int) {
        // Assign initial ownership values.
        self.owner = sender();
        self.pendingOwner = null;

        self.id = id;
        self.count = count;
    }

    // --- Message Receivers ---

    // Handles SetCount message
    receive(msg: SetCount) {
        // Use the requireOwner() function from the Ownable2Step trait to only allow the owner to send this message.
        self.requireOwner();

        self.count = msg.newCount;
    }

    // --- Getter Functions ---

    get fun count(): Int {
        return self.count;
    }

    get fun id(): Int {
        return self.id;
    }
}

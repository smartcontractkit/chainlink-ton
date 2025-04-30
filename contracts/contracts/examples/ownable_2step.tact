import "../lib/ownable_2step.tact";

/**
 * @title Ownable Counter contract example
 */


message SetCount {
    queryId: Int as uint64; // Standard query_id field
    newCount: Int as uint32; // Argument for the operation
}

contract OwnableCounter with Ownable2Step {
    // Ownership variables, required by the Ownable2Step trait
    owner: Address;
    pendingOwner: Address;


    id: Int as uint32;
    count: Int as uint32;

    // --- Initialization ---
    // The Ownable2Step won't force you to initialize the ownerhsip variables. It should be done anyways by calling the `initializeOwnership` function.
    init(id_init: Int, count_init: Int, owner_init: Address, pendingOwner_init: Address?) {
        self.initializeOwnership(owner_init, pendingOwner_init);

        self.id = id_init;
        self.count = count_init;
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


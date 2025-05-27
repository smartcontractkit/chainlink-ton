import "../lib/type_and_version";
import "../access/ownable_2step.tact";

message SetCount {
    queryId: Int as uint64;
    newCount: Int as uint32;
}

/// Ownable Counter contract example
///
contract OwnableCounter with Ownable2Step, TypeAndVersion {
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

    // --- TypeAndVersion Functions ---

    // Type must be a Reverse Domain Name Notation string that is uinique to the contract and should not change betwen versions.
    // Example: "com.chainlink.project.package.ContractName"
    // Read more about Reverse DNS Notation at https://en.wikipedia.org/wiki/Reverse_domain_name_notation
    override fun type(): String {
        return "com.chainlink.ton.examples.OwnableCounter";
    }

    // Version must be a semantic version string (e.g. "1.0.0"). Don't use "v" prefix; it will be added automatically.
    override fun version(): String {
        return "1.0.0";
    }
}

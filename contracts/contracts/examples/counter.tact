/**
 * @title Counter contract (Tact example)
 */

// --- Message Definitions ---

// Messages correspond to FunC/Tolk opcodes for setter operations.

// Opcodes are explicitly set to match the original constants.

message(4) SetCount {
    queryId: Int as uint64; // Standard query_id field
    newCount: Int as uint32; // Argument for the operation
}

// --- Contract Definition ---
contract Counter {
    // --- State Variables ---
    // Declared as contract fields. Persistence is handled automatically by Tact.
    // Types and sizes (`as uint32`) match the FunC storage layout.
    id: Int as uint32;
    count: Int as uint32;

    // --- Initialization ---
    // Uses init() function, common with tooling like Blueprint.
    // Values are passed during deployment via the deployment script.
    init(id_init: Int, count_init: Int) {
        // Assign initial values passed during deployment to state variables.
        self.id = id_init;
        self.count = count_init;
    }

    // --- Message Receivers ---
    // Each receiver handles one specific message type (identified by opcode).
    // Tact automatically parses the message body into the `msg` object.[3, 4, 5]

    // Handles SetCount message (opcode 4)
    receive(msg: SetCount) {
        // Update state variable directly using the parsed argument from the message.
        self.count = msg.newCount;
        // State change is automatically persisted by Tact. No save_data() call needed.[1]
    }

    // --- Implicit Handling Notes ---
    // 1. Unknown Opcodes: Messages with opcodes other than 4, 5, 6, 8, or 9
    //    will not match any receiver and fail implicitly (exit code 130).[3]
    // 2. Empty Messages: Empty messages will fail implicitly as `receive()` is omitted.[3]
    // 3. Bounced Messages: Bounced messages are implicitly filtered and ignored as no
    //    `bounced()` receiver is defined.[6, 7, 8, 9, 10]

    // --- Getter Functions ---
    // Use `get fun` syntax for read-only access to state variables.[11, 12]
    // Callable off-chain; cannot be called by other contracts.[12]
    // No manual `load_data()` needed due to Tact's implicit state management.[1]

    get fun count(): Int {
        return self.count;
    }

    get fun id(): Int {
        return self.id;
    }
}

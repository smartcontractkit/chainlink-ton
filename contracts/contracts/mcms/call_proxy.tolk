tolk 1.0

// --- Storage ---

/// CallProxy contract storage, auto-serialized to/from cell.
struct CallProxy_Data {
    /// ID allows multiple independent instances, since contract address depends on initial state.
    id: uint32;

    /// Target address to which the contract forwards all messages.
    target: address;
}

/// Load from contract data using auto-serialization.
@inline
fun CallProxy_Data.fromContractData() {
    return CallProxy_Data.fromCell(contract.getData());
}

// --- Message handlers ---

/// @notice a contract which acts as a forwarder that forwards the input from
/// any caller to a target contract.
fun onInternalMessage(in: InMessage) {
    /// Load the contract storage as target address and proxy the message
    val target = CallProxy_Data.fromContractData().target;

    // Proxy a message to the target
    val reply = createMessage({
        bounce: false,
        value: 0,
        dest: target,
        body: in.body
    });
    reply.send(SEND_MODE_IGNORE_ERRORS | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}

// --- Getters ---

get fun getID(): uint32 {
     return CallProxy_Data.fromContractData().id;
}

get fun getTarget(): address {
     return CallProxy_Data.fromContractData().target;
}

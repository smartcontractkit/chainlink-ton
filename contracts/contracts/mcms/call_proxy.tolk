tolk 1.0

// --- Messages - incoming ---

/// @dev Top up contract with TON coins.
/// Contract might receive/hold TON as part of the maintenance process.
///
struct (0x3b3d63b8) CallProxy_TopUp {
    /// Query ID of the change owner request.
    queryId: uint64;
}

/// @dev Union of all incoming messages.
type CallProxy_InMessage = CallProxy_TopUp

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
    val msg = lazy CallProxy_InMessage.fromSlice(in.body);
    match (msg) {
        CallProxy_TopUp => {
            // Top up the contract balance, no action needed, return early - no need to update storage
            // TODO: should there be a limit here?
            //  - funds are only needed for rent
            //  - funds can't be withdrawn once deposited
            // TODO: should we use reserveToncoinsOnBalance during proxying vs. handling specific TopUp message?
            return;
        }
        else => {
             /// Load the contract storage as target address and proxy the message
            val data = lazy CallProxy_Data.fromCell(contract.getData());

            // Proxy a message to the target
            val msg = createMessage({
                bounce: false,
                value: 0,
                dest: data.target,
                body: in.body
            });
            msg.send(SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }
    }
}

// --- Getters ---

get fun getID(): uint32 {
     return CallProxy_Data.fromContractData().id;
}

get fun getTarget(): address {
     return CallProxy_Data.fromContractData().target;
}


// Ownable2Step trait provides ownership two step transfer functionality
struct Ownable2Step {
    owner: address,
    pendingOwner: address?,
}

// --- Message structs ---

/// Message sent by the owner to transfer ownership of a contract.
///
struct Ownable2Step_TransferOwnership {
    /// Query ID of the change owner request.
    queryId: uint64;
    /// New owner.
    newOwner: Address;
}

// Message sent by the pendind owner to accept ownership of a contract.
//
struct Ownable2Step_AcceptOwnership {
    /// Query ID of the change owner request.
    queryId: uint64;
}

/// Message sent by the contract to the owner to confirm the ownership transfer.
///
struct Ownable2Step_OwnershipTransferRequested {
    /// Query ID of the change owner request.
    queryId: uint64;
    /// New owner that was set.
    newOwner: Address;
}

/// Message sent by the contract to the pending owner to confirm his acceptance of the contracts ownership.
///
struct Ownable2Step_OwnershipTransferred {
    /// Query ID of the change owner request.
    queryId: uint64;
    /// Old owner that has been replaced
    oldOwner: Address;
    /// New owner that was set.
    newOwner: Address;
}

// --- Internal Functions ---

/// Requires that the sender of the message is the owner of the contract.
///
/// #### Exit codes
/// * 1000: ERROR_ONLY_CALLABLE_BY_OWNER
fun Ownable2Step.requireOwner(self) {}

/// Initiates ownership transfer to a new address.
///
/// #### Exit codes
/// * 1001: ERROR_CANNOT_TRANSFER_TO_SELF
fun Ownable2Step.transferOwnership(self, to: address) {}

// --- Message handler ---

// Define a union type for the possible incoming messages
type Ownable2Step_Messages = Ownable2Step_TransferOwnership
    | Ownable2Step_AcceptOwnership
    | Ownable2Step_OwnershipTransferRequested
    | Ownable2Step_OwnershipTransferred;

/// Handles transfer/accept ownership messages for the Ownable2Step trait.
fun Ownable2Step.onInternalMessage(self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice): int {
    // handle Ownable2Step messages

    // We didn't handle the message, so we return 0
    return 0;
}

/// --- Getter Functions ---

/// Returns the owner of the contract.
fun Ownable2Step.get_owner(self) {}

/// Returns the pending owner of the contract.
fun Ownable2Step.get_pendingOwner(self) {}

// TODO: figure out how to express composable getters in Tolk,
// for now we declare scoped getters as signals for the contract to use and export them


/// --- specific contract implementation ---

// A contract example with Ownable2Step trait

struct TimelockController {
    ownable: Ownable2Step,
    // Other composable traits can be added here

    // Other fields specific to the contract
}

fun onInternalMessage(self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice): int {
    // handle Ownable2Step messages
    var storage = TimelockController.fromCell(contract.getData()); // here we load contract data

    var handeled = storage.ownable.onInternalMessage(myBalance, msgValue, msgFull, msgBody);
        // | chain other trait handlers here
    if (handeled) {
        // Store updates and return
        contract.setData(storage.toCell());
        return;
    }

    // or else continue handling messages
}

/// --- Getter Functions ---

/// Returns the owner of the contract.
get owner() {
    return TimelockController.fromCell(contract.getData()).ownable.get_owner();
}

/// Returns the pending owner of the contract.
get pendingOwner() {
    return TimelockController.fromCell(contract.getData()).ownable.get_pendingOwner();
}

// Ownable2Step trait which implements basic 2-step ownership transfer and nothing more. Does not utilize @stdlib/ownable.

const ERROR_ONLY_CALLABLE_BY_OWNER: Int = 1000;
const ERROR_CANNOT_TRANSFER_TO_SELF: Int = 1001;
const ERROR_OWNER_CANNOT_BE_ZERO: Int = 1002;
const ERROR_MUST_BE_PROPOSED_OWNER: Int = 1003;

/// Message sent by the owner to transfer ownership of a contract.
///
message TransferOwnership {
    /// Query ID of the change owner request.
    queryId: Int as uint64;
    /// New owner.
    newOwner: Address;
}

// Message sent by the pendind owner to accept ownership of a contract.
//
message AcceptOwnership {
    /// Query ID of the change owner request.
    queryId: Int as uint64;
}

/// Message sent by the contract to the owner to confirm the ownership transfer.
///
message TransferOwnershipOk {
    /// Query ID of the change owner request.
    queryId: Int as uint64;
    /// New owner that was set.
    newOwner: Address;
}

/// Message sent by the contract to the pending owner to confirm his acceptanse of the contracts ownership.
///
message AcceptOwnershipOk {
    /// Query ID of the change owner request.
    queryId: Int as uint64;
    /// Old owner that has been replaced
    oldOwner: Address;
    /// New owner that was set.
    newOwner: Address;
}

trait Ownable2Step with BaseTrait {
    // Storage
    owner: Address;
    pendingOwner: Address;
    
    /// Receiver for the `TransferOwnership` message body.
    /// Updates the `pendingOwner` value.
    /// Can only be called by the owner.
    ///
    /// #### Exit codes
    ///
    /// * 1000: ERROR_ONLY_CALLABLE_BY_OWNER
    /// * 1001: ERROR_ONLY_CALLABLE_BY_OWNER
    receive(msg: TransferOwnership) {
	// Check if the sender is the owner
	self.requireOwner();

	if (msg.newOwner == self.owner) {
		throw(ERROR_CANNOT_TRANSFER_TO_SELF)
	}

	// Update pending owner
	self.pendingOwner = msg.newOwner;

	// Reply to confimm
	self.reply(ChangeOwnerOk { queryId: msg.queryId, newOwner: msg.newOwner }.toCell());
	
	//TODO: send outgoing message (log/event) confirming.
	//	The reply to the sender might be enough, should check.
	//    emit OwnershipTransferRequested(s_owner, to);

    }

    /// Receiver for the `AcceptOwnership` message body.
    /// Finalizes ownership transfer by replacing the owner with the pending owner. 
    /// Can only be called by the pending owner of the contract.
    ///
    /// #### Exit codes
    ///
    /// * 1003: ERROR_MUST_BE_PROPOSED_OWNER
    receive(msg: AcceptOwnership) {
	throwUnless(ERROR_MUST_BE_PROPOSED_OWNER, sender() == self.pendingOwner);
	let changedOwner: Address = self.owner;
	self.owner = self.pendingOwner
	self.reply(AcceptOwnershipOk {
		queryId: msg.queryId,
		oldOwner: changedOwner,
		newOwner: self.owner 
	} 
    }

    /// Requires that the sender is the owner of the contract.
    ///
    /// #### Exit codes
    ///
    /// * 1000: ERROR_ONLY_CALLABLE_BY_OWNER
    fun requireOwner() {
        throwUnless(ERROR_ONLY_CALLABLE_BY_OWNER, sender() == self.owner);
    }
}

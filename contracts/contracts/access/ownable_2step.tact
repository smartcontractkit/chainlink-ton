// Ownable2Step trait which implements basic 2-step ownership transfer and nothing more. 
// Does not utilize @stdlib/ownable.

const ERROR_ONLY_CALLABLE_BY_OWNER: Int = 1000;
const ERROR_CANNOT_TRANSFER_TO_SELF: Int = 1001;
const ERROR_MUST_BE_PROPOSED_OWNER: Int = 1002;

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
    // Required storage variables.
    owner: Address;
    pendingOwner: Address?;
    
    /// --- Message Receivers ---

    /// Receiver for the `TransferOwnership` message body.
    /// Updates the `pendingOwner` value.
    /// Can only be called by the owner.
    ///
    /// #### Exit codes
    /// * 1000: ERROR_ONLY_CALLABLE_BY_OWNER
    /// * 1001: ERROR_ONLY_CALLABLE_BY_OWNER
    receive(msg: TransferOwnership) {
	// Check if the sender is the owner
	self.requireOwner();

	// Update the pending owner
	self.transferOwnership(msg.newOwner);

	// Reply to confirm and emit event. 	
	// TODO: Doing both of these is a bit redundant. Analyze if we can leave the reply only.
	//	 The reply would allow another contract calling TransferOwnership to confirm that the transaction is done.
	//	 The emitted outgoing message on the other hand is only readable off-chain.
	let transferOwnershipOk = TransferOwnershipOk {
	    queryId: msg.queryId,
	    newOwner: msg.newOwner,
	};
	self.reply(transferOwnershipOk.toCell());
	emit(transferOwnershipOk.toCell());
    }

    /// Receiver for the `AcceptOwnership` message body.
    /// Finalizes ownership transfer by replacing the owner with the pending owner. 
    /// Can only be called by the pending owner of the contract.
    ///
    /// #### Exit codes
    /// * 1002: ERROR_MUST_BE_PROPOSED_OWNER
    receive(msg: AcceptOwnership) {
	throwUnless(ERROR_MUST_BE_PROPOSED_OWNER, self.pendingOwner != null);
	throwUnless(ERROR_MUST_BE_PROPOSED_OWNER, sender() == self.pendingOwner!!);

	let previousOwner: Address = self.owner;
	self.owner = sender();

	let acceptOwnershipOk = AcceptOwnershipOk {
	    queryId: msg.queryId,
	    oldOwner: previousOwner,
	    newOwner: self.owner, 
	};

	// TODO: Analyze if doing both the reply and emit makes sense. Read TransferOwnership's TODO.
	self.reply(acceptOwnershipOk.toCell())
	emit(acceptOwnershipOk.toCell())

    }

    /// --- Getter Functions ---

    /// Returns the owner of the contract.
    get fun owner(): Address {
        return self.owner;
    }

    // --- Internal Functions ---

    /// Requires that the sender of the message is the owner of the contract.
    ///
    /// #### Exit codes
    /// * 1000: ERROR_ONLY_CALLABLE_BY_OWNER
    fun requireOwner() {
        throwUnless(ERROR_ONLY_CALLABLE_BY_OWNER, sender() == self.owner);
    }

    /// Initiates ownership transfer to a new address.
    /// 
    /// #### Exit codes
    /// * 1001: ERROR_CANNOT_TRANSFER_TO_SELF
    fun transferOwnership(to: Address) {
	if (to == self.owner) {
		throw(ERROR_CANNOT_TRANSFER_TO_SELF);
	}

	// Update pending owner
	self.pendingOwner = to;
    }


}

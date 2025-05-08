import "./exit_codes.tact";

/// `Ownable2Step` trait which implements basic 2-step ownership transfer and nothing more. 
/// Does not utilize @stdlib/ownable.

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
message OwnershipTransferRequested {
    /// Query ID of the change owner request.
    queryId: Int as uint64;
    /// New owner that was set.
    newOwner: Address;
}

/// Message sent by the contract to the pending owner to confirm his acceptance of the contracts ownership.
///
message OwnershipTransferred {
    /// Query ID of the change owner request.
    queryId: Int as uint64;
    /// Old owner that has been replaced
    oldOwner: Address;
    /// New owner that was set.
    newOwner: Address;
}
@interface("org.ton.ownable")
@interface("chainlink.ownable_2step")
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
	// Update the pending owner
	self.transferOwnership(msg.newOwner);

	// Reply to confirm. 	
	self.reply(OwnershipTransferRequested {
	    queryId: msg.queryId,
	    newOwner: msg.newOwner,
	}.toCell());
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

	// Reply to cofirm
	self.reply(OwnershipTransferred {
	    queryId: msg.queryId,
	    oldOwner: previousOwner,
	    newOwner: self.owner, 
	}.toCell());

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
	// Check if the sender is the owner
	self.requireOwner();

	throwUnless(ERROR_CANNOT_TRANSFER_TO_SELF, to != self.owner);

	// Update pending owner
	self.pendingOwner = to;
    }
}

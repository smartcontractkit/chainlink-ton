import "@stdlib/ownable";

/// Message for the step of the counter.
message(1) Step {
    queryId: Int as uint64;
}

/// Counter trait example
trait StepCounter with Ownable {
    /// --- Ownable Attributes ---
    /// Contract owner
    owner: Address;

    // Empty receiver for the deployment,
    // which expects the `null` message body
    receive() {
        cashback(sender());
    }

    /// Step the counter
    receive(msg: Step) {
        self.step();
        cashback(sender());
    }

    /// Handle step instruction
    virtual fun step() {
        throw(1000);
    }

    get virtual fun value(): Int {
        throw(1000);
    }
}

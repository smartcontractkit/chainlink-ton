import "@stdlib/ownable";

/// Message for the step of the counter.
message(1) Step {
    queryId: Int as uint64;
}

/// Counter trait example
trait ICounter with Ownable {
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
        self.handle_step(msg.queryId);
        cashback(sender());
    }

    /// Handle step instruction
    abstract fun handle_step(queryId: Int);
}

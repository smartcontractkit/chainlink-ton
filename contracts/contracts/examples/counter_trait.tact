import "@stdlib/ownable";

message(1) Step {
    queryId: Int as uint64;
}

trait ICounter with Ownable {
    owner: Address;

    // Empty receiver for the deployment,
    // which expects the `null` message body
    receive() {
        cashback(sender());
    }

    receive(msg: Step) {
        self.handle_step(msg.queryId);

        cashback(sender());
    }

    // Update counter
    abstract fun handle_step(queryId: Int);
}

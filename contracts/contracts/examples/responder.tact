/// Request the responder a value, expecting the response in the callbackOpcode.
message(500) Request {
    queryId: Int as uint64;
    callbackOpcode: Int as uint32;
}

/// Responder is able to respond to requests, returning a value to the sender() in the callbackOpcode.
trait Responder {
    receive(msg: Request) {
        self.respond(msg, sender());
    }

    /// Respond to a request, returning a value to the sender() in the callbackOpcode.
    /// TODO: make virtual
    abstract fun respond(msg: Request, sender: Address);
}

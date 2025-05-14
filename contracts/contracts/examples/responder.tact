message(500) Request {
    queryId: Int as uint64;
    callbackOpcode: Int as uint32;
}

trait Responder {
    receive(msg: Request) {
        self.respond(msg, sender());
    }

    abstract fun respond(msg: Request, sender: Address);
}

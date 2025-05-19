import "./responder";

/// DirectResponder is an implementation of Responder that has the value stored in the contract.
trait DirectResponder with Responder {
    /// Respond to a request, returning a value to the sender() in the callbackOpcode.
    override fun respond(msg: Request, sender: Address) {
        let b = beginCell()
            .storeUint(msg.callbackOpcode, 32)
            .storeUint(msg.queryId, 64);
        b = self.storeValue(b);
        message(MessageParameters {
            mode: SendRemainingValue,
            body: b.endCell(),
            value: 0,
            to: sender,
            bounce: true,
        });
    }

    /// Store the value in the builder.
    abstract fun storeValue(b: Builder): Builder;
}

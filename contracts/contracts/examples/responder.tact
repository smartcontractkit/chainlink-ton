message(500) Request {
    queryId: Int as uint64;
    callbackOpcode: Int as uint32;
}

trait Responder {
    receive(msg: Request) {
        let response = self.getResponse();
        message(MessageParameters {
            mode: SendRemainingValue,
            body: beginCell()
                .storeUint(msg.callbackOpcode, 32)
                .storeUint(msg.queryId, 64)
                .storeUint(response, 64)
                .endCell(),
            value: 0,
            to: sender(),
            bounce: true,
        });
    }

    abstract fun getResponse(): Int;
}

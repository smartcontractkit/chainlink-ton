import "./bouncer";

message(1) SendRequest {
    queryId: Int as uint64;
    address: Address;
    value: Int as uint64;
}

contract Requester() {
    receive() {
        dump("Requester contract initialized");
    }

    receive(msg: SendRequest) {
        message(MessageParameters {
            to: msg.address,
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            body: Request {
                queryId: msg.queryId,
                value: msg.value,
            }.toCell(),
        });
    }

    bounced(msg: bounced<Request>) {
        emit("Bounced message received".asComment());
    }
}

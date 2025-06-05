import "./bouncer";

message(1) SendRequest {
    queryId: Int as uint64;
    address: Address;
    value: Int as uint64;
}

message(1) Request {
    queryId: Int as uint64;
    value: Int as uint64;
}

message(400) Error {
    queryId: Int as uint64;
    exitCode: Int as uint32;
}

message(200) Success {
    queryId: Int as uint64;
}

struct ErrorEvent {
    queryId: Int as uint64;
    exitCode: Int as uint32;
}

struct SuccessEvent {
    queryId: Int as uint64;
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

    receive(msg: Error) {
        emit(ErrorEvent {
            queryId: msg.queryId,
            exitCode: msg.exitCode,
        }.toCell());
    }

    receive(msg: Success) {
        emit(SuccessEvent {
            queryId: msg.queryId,
        }.toCell());
    }
}

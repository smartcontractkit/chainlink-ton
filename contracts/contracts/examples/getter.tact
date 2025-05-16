import "@stdlib/ownable";
import "./responder";

message(1) Get {
    queryId: Int as uint64;
    Address: Address;
    opcode: Int as uint32;
}

const setOpcode: Int = 1001;

message(setOpcode) Set {
    queryId: Int as uint64;
    value: Int as uint64;
}

/// Getter contract example
/// This contract is able to request a value and store the response.
contract Getter(
    id: Int as uint32,
    owner: Address,
    value: Int as uint64,
) with Ownable {
    // Empty receiver for the deployment,
    // which expects the `null` message body
    receive() {
        cashback(sender());
    }

    /// The request to be sent to the responder
    receive(msg: Get) {
        message(
            MessageParameters {
                mode: SendRemainingValue,
                body: Request {
                    queryId: msg.queryId,
                    callbackOpcode: setOpcode,
                }.toCell(),
                value: 0,
                to: msg.Address,
                bounce: true,

            },
        );
        cashback(sender());
    }

    /// The value received from the responder
    receive(msg: Set) {
        self.value = msg.value;
    }

    get fun response(): Int {
        return self.value;
    }

    get fun id(): Int {
        return self.id;
    }
}

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

    receive(msg: Set) {
        self.value = msg.value;
        self.forward(self.owner, null, false, null);
    }

    get fun response(): Int {
        return self.value;
    }

    get fun id(): Int {
        return self.id;
    }
}

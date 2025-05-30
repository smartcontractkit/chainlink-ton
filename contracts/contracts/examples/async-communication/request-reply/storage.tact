import "./price_registry.tact";

/// Memory contract (two-msg-chain example)
message(1) GetPriceFrom {
    query_id: Int as uint64; // Standard query_id field
    priceRegistry: Address; // Address of the price registry contract
    key: Int as uint8;
}

message(2) Store {
    query_id: Int as uint64; // Standard query_id field
    new_value: Int as uint32; // Argument for the operation
}

contract Storage {
    id: Int as uint32;
    pending_request_id: Int as uint64 = 0;
    value: Int as uint64 = 0;

    init(id: Int as uint32) {
        self.id = id;
    }

    receive(msg: GetPriceFrom) {
        self.pending_request_id = msg.query_id;
        self.value = 0;
        message(MessageParameters {
            to: msg.priceRegistry,
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            body: GetPrice {
                query_id: msg.query_id,
                key: msg.key,
            }.toCell(),
        });
    }

    receive(msg: Store) {
        throwUnless(777, self.pending_request_id == msg.query_id);
        self.value = msg.new_value;
    }

    get fun id(): Int {
        return self.id;
    }

    get fun value(): Int {
        return self.value;
    }
}

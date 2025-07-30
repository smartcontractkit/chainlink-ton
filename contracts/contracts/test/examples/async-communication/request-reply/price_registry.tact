import "./item_price.tact";
import "./storage.tact";

/// Memory contract (two-msg-chain example)
message(1) GetPrice {
    query_id: Int as uint64;
    key: Int as uint8;
}

message(2) RequestedPrice {
    query_id: Int as uint64;
    price: Int as uint64;
}

message(3) AddPriceItem {
    query_id: Int as uint64;
    key: Int as uint8;
    addr: Address;
}

contract PriceRegistry {
    id: Int as uint32;
    pending_requests: map<Int as uint64, Address>;
    priceAddrs: map<Int as uint8, Address>;

    init(id: Int as uint32) {
        self.id = id;
        self.priceAddrs = emptyMap();
        self.pending_requests = emptyMap();
    }

    receive(msg: GetPrice) {
        throwUnless(999, self.priceAddrs.exists(msg.key));
        let priceAddr = self.priceAddrs.get(msg.key)!!;
        self.pending_requests.set(msg.query_id, sender());
        message(MessageParameters {
            to: priceAddr,
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            body: GetItemPrice {
                query_id: msg.query_id,
            }.toCell(),
        });
    }

    receive(msg: RequestedPrice) {
        throwUnless(888, self.pending_requests.exists(msg.query_id));
        let requester = self.pending_requests.get(msg.query_id)!!;
        let _ = self.pending_requests.del(msg.query_id);
        message(MessageParameters {
            to: requester,
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            body: Store {
                query_id: msg.query_id,
                new_value: msg.price,
            }.toCell(),
        });
    }

    receive(msg: AddPriceItem) {
        self.priceAddrs.set(msg.key, msg.addr);
    }

    get fun id(): Int {
        return self.id;
    }
}

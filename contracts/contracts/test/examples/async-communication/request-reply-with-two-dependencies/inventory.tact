import "./item_price.tact";
import "./item_count.tact";
import "./storage.tact";

/// Memory contract (two-msg-chain example)
message(1) GetCapital {
    query_id: Int as uint64;
    key: Int as uint8;
}

message(2) AddItem {
    query_id: Int as uint64;
    key: Int as uint8;
    priceAddr: Address;
    inventoryAddr: Address;
}

message(3) RequestedPrice {
    query_id: Int as uint64;
    price: Int as uint64;
}

message(4) RequestedCount {
    query_id: Int as uint64;
    count: Int as uint64;
}

struct Request {
    requester: Address;
    completedCountRequest: Bool;
    count: Int as uint64;
    completedPriceRequest: Bool;
    price: Int as uint64;
}

contract Inventory {
    id: Int as uint32;
    pending_requests: map<Int as uint64, Request>;
    prices: map<Int as uint8, Address>;
    counts: map<Int as uint8, Address>;

    init(id: Int as uint32) {
        self.id = id;
        self.prices = emptyMap();
        self.counts = emptyMap();
        self.pending_requests = emptyMap();
    }

    receive(msg: GetCapital) {
        emit(beginComment()
            .concat("GetCapital: ")
            .concat("qid: ")
            .concat(msg.query_id.toString())
            .concat(", key: ")
            .concat(msg.key.toString())
            .toCell());
        throwUnless(999, self.prices.exists(msg.key));
        throwUnless(999, self.counts.exists(msg.key));
        let price = self.prices.get(msg.key)!!;
        let count = self.counts.get(msg.key)!!;
        self.pending_requests.set(msg.query_id, Request {
            requester: sender(),
            completedCountRequest: false,
            count: 0,
            completedPriceRequest: false,
            price: 0,
        });
        message(MessageParameters {
            to: price,
            value: 250000000,
            mode: SendPayFwdFeesSeparately,
            body: GetItemPrice {
                query_id: msg.query_id,
            }.toCell(),
        });
        emit(beginComment()
            .concat("GetItemPrice sent: ")
            .toCell());
        message(MessageParameters {
            to: count,
            value: 250000000,
            mode: SendPayFwdFeesSeparately,
            body: GetItemCount {
                query_id: msg.query_id,
            }.toCell(),
        });
        emit(beginComment()
            .concat("GetItemCount sent: ")
            .toCell());
    }

    receive(msg: RequestedPrice) {
        let fizz: StringBuilder = beginComment();
        fizz.append("RequestedPrice: ");
        fizz.append("qid: ");
        fizz.append(msg.query_id.toString());
        fizz.append(", p: ");
        fizz.append(msg.price.toString());
        emit(fizz.toCell());
        throwUnless(888, self.pending_requests.exists(msg.query_id));
        let request = self.pending_requests.get(msg.query_id)!!;

        if !request.completedCountRequest {
            emit("Req not completed".asComment());
            request.completedPriceRequest = true;
            request.price = msg.price;
            self.pending_requests.set(msg.query_id, request);
            emit(beginComment()
                .concat("Request: ")
                .concat("price: ")
                .concat(request.price.toString())
                .concat(", count: ")
                .concat(request.count.toString())
                .concat(", qid: ")
                .concat(msg.query_id.toString())
                .toCell());
            return;
        }

        let _ = self.pending_requests.del(msg.query_id);
        message(MessageParameters {
            to: request.requester,
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            body: Store {
                query_id: msg.query_id,
                new_value: msg.price * request.count,
            }.toCell(),
        });
        emit("Req completed".asComment());
    }

    receive(msg: RequestedCount) {
        let fizz: StringBuilder = beginComment();
        fizz.append("RequestedCount: ");
        fizz.append("qid: ");
        fizz.append(msg.query_id.toString());
        fizz.append(", c: ");
        fizz.append(msg.count.toString());
        emit(fizz.toCell());
        throwUnless(777, self.pending_requests.exists(msg.query_id));
        let request = self.pending_requests.get(msg.query_id)!!;

        if !request.completedPriceRequest {
            emit("Req not completed".asComment());
            request.completedCountRequest = true;
            request.count = msg.count;
            self.pending_requests.set(msg.query_id, request);
            emit(beginComment()
                .concat("Request: ")
                .concat("price: ")
                .concat(request.price.toString())
                .concat(", count: ")
                .concat(request.count.toString())
                .concat(", qid: ")
                .concat(msg.query_id.toString())
                .toCell());
            return;
        }

        let _ = self.pending_requests.del(msg.query_id);
        message(MessageParameters {
            to: request.requester,
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            body: Store {
                query_id: msg.query_id,
                new_value: msg.count * request.price,
            }.toCell(),
        });
        emit("Req completed".asComment());
    }

    receive(msg: AddItem) {
        emit(beginComment()
            .concat("AddItem: ")
            .concat("key: ")
            .concat(msg.key.toString())
            .toCell());
        self.prices.set(msg.key, msg.priceAddr);
        self.counts.set(msg.key, msg.inventoryAddr);
    }

    get fun id(): Int {
        return self.id;
    }
}

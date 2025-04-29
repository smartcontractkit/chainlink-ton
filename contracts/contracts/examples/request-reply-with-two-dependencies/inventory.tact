import "./item_price.tact";
import "./item_count.tact";
import "./storage.tact";

/**
 * @title Memory contract (two-msg-chain example)
 */

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

struct Item {
    priceAddr: Address;
    inventoryAddr: Address;
}

contract Inventory {
    id: Int as uint32;
    pending_requests: map<Int as uint64, Request>;
    items : map<Int as uint8, Item>;

    init(id: Int as uint32) {
        self.id = id;
        self.items = emptyMap();
        self.pending_requests = emptyMap();
    }

    receive(msg: GetCapital) {
        // emit(beginComment()
        //     .concat("GetCapital: ")
        //     .concat("query_id: ")
        //     .concat(msg.query_id.toString())
        //     .concat(", key: ")
        //     .concat(msg.key.toString())
        //     .toCell());
        throwUnless(999, self.items.exists(msg.key));
        let item = self.items.get(msg.key)!!;
        self.pending_requests.set(msg.query_id, Request{
            requester: sender(),
            completedCountRequest: false,
            count: 0,
            completedPriceRequest: false,
            price: 0,
        });
        message(MessageParameters{
            to: item.priceAddr,
            value: 25000,
            mode: SendPayFwdFeesSeparately | SendIgnoreErrors,
            body: GetItemPrice {
                query_id: msg.query_id,
            }.toCell(),
        });
        // emit(beginComment()
        //     .concat("RequestedPrice sent: ")
        //     .concat(item.priceAddr.toString())
        //     .concat(", query_id: ")
        //     .concat(msg.query_id.toString())
        //     .toCell());
        message(MessageParameters{
            to: item.inventoryAddr,
            value: 25000,
            mode: SendPayFwdFeesSeparately | SendIgnoreErrors,
            body: GetItemCount {
                query_id: msg.query_id,
            }.toCell(),
        });
        // emit(beginComment()
        //     .concat("RequestedCount sent: ")
        //     .concat(item.inventoryAddr.toString())
        //     .concat(", query_id: ")
        //     .concat(msg.query_id.toString())
        //     .toCell());
    }

    receive(msg: RequestedPrice) {
        // let fizz: StringBuilder = beginComment();
        // fizz.append("RequestedPrice: ");
        // fizz.append("query_id: ");
        // fizz.append(msg.query_id.toString());
        // fizz.append(", price: ");
        // fizz.append(msg.price.toString());
        // emit(fizz.toCell());
        throwUnless(888,self.pending_requests.exists(msg.query_id));
        let request = self.pending_requests.get(msg.query_id)!!;
        
        if !request.completedCountRequest {
            emit("Request not completed".asComment());
            request.completedPriceRequest = true;
            request.price = msg.price;
            self.pending_requests.set(msg.query_id, request);
            return 
        }

        let _ = self.pending_requests.del(msg.query_id);
        message(MessageParameters{
            to: request.requester,
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            body: Store {
                query_id: msg.query_id,
                new_value: msg.price + request.count,
            }.toCell(),
        });
        emit("Request completed".asComment());
    }

    receive(msg: RequestedCount) {
        // let fizz: StringBuilder = beginComment();
        // fizz.append("RequestedCount: ");
        // fizz.append("query_id: ");
        // fizz.append(msg.query_id.toString());
        // fizz.append(", count: ");
        // fizz.append(msg.count.toString());
        // emit(fizz.toCell());
        throwUnless(777,self.pending_requests.exists(msg.query_id));
        let request = self.pending_requests.get(msg.query_id)!!;
        
        if !request.completedPriceRequest {
            emit("Request not completed".asComment());
            request.completedCountRequest = true;
            request.count = msg.count;
            self.pending_requests.set(msg.query_id, request);
            return 
        }

        let _ = self.pending_requests.del(msg.query_id);
        message(MessageParameters{
            to: request.requester,
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            body: Store {
                query_id: msg.query_id,
                new_value: msg.count + request.price,
            }.toCell(),
        });
        emit("Request completed".asComment());
    }

    receive(msg: AddItem) {
        // emit(beginComment()
        //     .concat("AddItem: ")
        //     .concat("query_id: ")
        //     .concat(msg.query_id.toString())
        //     .concat(", key: ")
        //     .concat(msg.key.toString())
        //     .concat(", priceAddr: ")
        //     .concat(msg.priceAddr.toString())
        //     .concat(", inventoryAddr: ")
        //     .concat(msg.inventoryAddr.toString())
        //     .toCell());
        self.items.set(msg.key, Item{
            priceAddr: msg.priceAddr,
            inventoryAddr: msg.inventoryAddr,
        });
    }

    get fun id(): Int {
        return self.id;
    }
}

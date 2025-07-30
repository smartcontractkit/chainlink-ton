import "./price_registry.tact";

/// Memory contract (two-msg-chain example)
message(1) GetItemPrice {
    query_id: Int as uint64; // Standard query_id field
}

contract ItemPrice(
    id: Int as uint32,
    price: Int as uint64,
) {
    receive(msg: GetItemPrice) {
        self.reply(RequestedPrice {
            query_id: msg.query_id,
            price: self.price,
        }.toCell());
    }
}

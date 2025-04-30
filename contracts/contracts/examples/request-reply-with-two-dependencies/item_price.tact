import "./inventory.tact";

/**
 * @title Memory contract (two-msg-chain example)
 */

message(1) GetItemPrice {
    query_id: Int as uint64; // Standard query_id field
}

contract ItemPrice (
    id: Int as uint32,
    price: Int as uint64,
) {
    receive(msg: GetItemPrice) {
        emit(beginComment().concat("GetItemPrice: query_id: ").concat(msg.query_id.toString()).toCell());
        self.reply(RequestedPrice {
                query_id: msg.query_id,
                price: self.price,
            }.toCell());
        emit(beginComment().concat("RequestedPrice sent: ").concat(self.price.toString()).toCell());
    }
}

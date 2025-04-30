import "./inventory.tact";

/**
 * @title Memory contract (two-msg-chain example)
 */

message(1) GetItemCount {
    query_id: Int as uint64; // Standard query_id field
}

contract ItemCount (
    id: Int as uint32,
    count: Int as uint64,
) {
    receive(msg: GetItemCount) {
        emit(beginComment().concat("GetItemCount: qid: ").concat(msg.query_id.toString()).toCell());
        self.reply(RequestedCount {
                query_id: msg.query_id,
                count: self.count,
            }.toCell());
        emit(beginComment().concat("RequestedCount sent: ").concat(self.count.toString()).toCell());
    }
}

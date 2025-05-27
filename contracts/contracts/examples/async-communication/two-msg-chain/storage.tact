import "./memory.tact";

/// Memory contract (two-msg-chain example)
message(1) Store {
    queryId: Int as uint64; // Standard query_id field
    newValue: Int as uint32; // Argument for the operation
}

contract Storage(
    id: Int as uint32,
    memory_addr: Address,
) {
    receive(msg: Store) {
        send(SendParameters {
            to: self.memory_addr,
            value: 0,
            mode: SendRemainingValue | SendIgnoreErrors,
            body: MemorySetValue {
                queryId: msg.queryId,
                newValue: msg.newValue,
            }.toCell(),
        });
    }

    get fun id(): Int {
        return self.id;
    }
}

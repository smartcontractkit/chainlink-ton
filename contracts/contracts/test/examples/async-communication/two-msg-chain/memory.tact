/// Memory contract (two-msg-chain example)
message(1) MemorySetValue {
    queryId: Int as uint64; // Standard query_id field
    newValue: Int as uint32; // Argument for the operation
}

contract Memory {
    id: Int as uint32;
    value: Int as uint32;

    init(
        id: Int as uint32,
        value: Int as uint32,
    ) {
        self.id = id;
        self.value = value;
    }

    receive(msg: MemorySetValue) {
        self.value = msg.newValue;
    }

    get fun value(): Int {
        return self.value;
    }

    get fun id(): Int {
        return self.id;
    }
}

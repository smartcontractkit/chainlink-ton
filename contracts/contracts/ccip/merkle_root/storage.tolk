import "../offramp/types";

// cases:
// execution failed, and root was committed
// well actually, a root must always exist!
// so the only case is where a root was committed but message was left unexecuted

struct MerkleRoot_Storage {
    root: uint256;
    owner: address;
    timestamp: uint64;
    expectedMessages: uint16;
    messageStates: map<uint256, ExecutionState>; // messageId -> state
    deliveredMessageCount: uint16 = 0;
}

fun MerkleRoot_Storage.load(): MerkleRoot_Storage {
    return MerkleRoot_Storage.fromCell(contract.getData());
}

fun MerkleRoot_Storage.store(self) {
    return contract.setData(self.toCell());
}

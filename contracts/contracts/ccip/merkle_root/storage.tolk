import "../offramp/types";
import "../common/types";

struct MerkleRoot_Storage {
    rootId: uint224;
    owner: address;
    state: uint8 = 0;
    executionState: uint8 = 0; 
    tokenBalance: TokenBalance = TokenBalance{};
    message: Cell<Any2TVMRampMessage>? = null;
}

fun MerkleRoot_Storage.load(): MerkleRoot_Storage {
    return MerkleRoot_Storage.fromCell(contract.getData());
}

fun MerkleRoot_Storage.store(self) {
    return contract.setData(self.toCell());
}

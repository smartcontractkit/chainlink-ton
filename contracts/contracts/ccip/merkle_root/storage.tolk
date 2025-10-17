import "../offramp/types";
import "types";

struct MerkleRoot_Storage {
    rootId: uint224;
    owner: address;
    expectedMessages: uint16;
    validatedMessages: map<uint256, bool>; // messageId -> alreadyValidated 
    validatedMessageCount: uint16 = 0;
}

fun MerkleRoot_Storage.load(): MerkleRoot_Storage {
    return MerkleRoot_Storage.fromCell(contract.getData());
}

fun MerkleRoot_Storage.store(self) {
    return contract.setData(self.toCell());
}

import "types.tolk"
import "../offramp/types.tolk";

struct MerkleRoot_Storage {
    rootId: uint224;
    owner: address;
    state: uint8 = 0;
    executionState: uint8 = 0; 
    tokenBalance: TokenBalance = TokenBalance{};
    message: Cell<Any2TVMRampMessage>? = null;
}

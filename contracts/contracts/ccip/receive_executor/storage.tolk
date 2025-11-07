import "../offramp/types"
import "../common/types"
import "types"

struct ReceiveExecutor_Storage {
    owner: address; // MerkleRoot contract
    message: Cell<Any2TVMRampMessage>;
    root: address;
    execId: uint192;
    state: ReceiveExecutor_MessageState = ReceiveExecutor_MessageState.Untouched;
    lastExecutionTimestamp: uint64 = 0;
    tokenBalance: TokenBalance = TokenBalance{};
}

fun CCIPReceiveExecutor_Storage.load(): CCIPReceiveExecutor_Storage {
    return CCIPReceiveExecutor_Storage.fromCell(contract.getData());
}

fun CCIPReceiveExecutor_Storage.store(self) {
    return contract.setData(self.toCell());
}

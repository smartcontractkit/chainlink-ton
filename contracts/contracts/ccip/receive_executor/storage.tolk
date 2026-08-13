// SPDX-License-Identifier: BUSL-1.1
import "../offramp/types"
import "types"

struct ReceiveExecutor_Storage {
    owner: address; // OffRamp
    message: Cell<Any2TVMRampMessage>;
    root: address;
    execId: uint192;
    state: ReceiveExecutor_MessageState = ReceiveExecutor_MessageState.Untouched;
    lastExecutionTimestamp: uint64 = 0;
    tokenAdminRegistry: Cell<address>? = null;
    tokenPool: Cell<address>? = null; // TODO move this to state attribute
}

fun ReceiveExecutor_Storage.load(): ReceiveExecutor_Storage {
    return ReceiveExecutor_Storage.fromCell(contract.getData());
}

fun ReceiveExecutor_Storage.store(self) {
    return contract.setData(self.toCell());
}

// SPDX-License-Identifier: BUSL-1.1
import "../offramp/types"
import "types"

struct ReceiveExecutor_Storage {
    owner: address; // OffRamp
    message: Cell<Any2TVMRampMessage>;
    root: address;
    execId: uint192;
    state: ReceiveExecutor_State = ReceiveExecutor_State {
        // tokenTransfer is initialized it in the handler `onInitExecute` if it is null.
        tokenTransfer: null,
        messageExecution: ReceiveExecutor_MessageExecutionState.Untouched,
        // effectiveGasLimit is initialized it in `onInitExecute`.
        effectiveGasLimit: 0,
    };
    lastExecutionTimestamp: uint64 = 0;
}

fun ReceiveExecutor_Storage.load(): ReceiveExecutor_Storage {
    return ReceiveExecutor_Storage.fromCell(contract.getData());
}

fun ReceiveExecutor_Storage.store(self) {
    return contract.setData(self.toCell());
}

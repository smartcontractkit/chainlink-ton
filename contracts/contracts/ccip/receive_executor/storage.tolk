// SPDX-License-Identifier: BUSL-1.1
import "../offramp/types"
import "types"

struct ReceiveExecutor_Storage {
    owner: address; // OffRamp
    message: Cell<Any2TVMRampMessage>;
    root: address;
    execId: uint192;
    state: ReceiveExecutor_State = ReceiveExecutor_State {
        // Note: why tokenTransfer is optional
        // 1. `tokenTransfer` is not of type `ReceiveExecutor_TokenTransferState`
        // because it overflows the struct, so we put it inside a `Cell`.
        // 2. Tolk has a limitation which prevents attributes of type Cell<T>
        // from having default values. `T.toCell()` errors as it is not a constant expression.
        // 3. thus, we define `null` to be equivalent as `ReceiveExecutor_TokenTransferState_Untouched`
        // and initialize it in the handler `onInitExecute` if it is null.
        tokenTransfer: null,
        messageExecution: ReceiveExecutor_MessageExecutionState.Untouched,
    };
    lastExecutionTimestamp: uint64 = 0;
}

fun ReceiveExecutor_Storage.load(): ReceiveExecutor_Storage {
    return ReceiveExecutor_Storage.fromCell(contract.getData());
}

fun ReceiveExecutor_Storage.store(self) {
    return contract.setData(self.toCell());
}

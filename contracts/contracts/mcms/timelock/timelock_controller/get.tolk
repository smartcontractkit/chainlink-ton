tolk 0.99

import "../../../lib/access/access_control.tolk";

import "./storage.tolk";
import "./operation_utils.tolk";
import "./params.tolk";

get getTimelockControllerData(): (int, int, dict, dict, dict, dict, dict) {
    val s = loadData();
    val rbac = RBACAccessControl.fromCell(s.rbac);
    return (
        s.minDelay,
        s.timestampCount,
        rbac.adminAccounts,
        rbac.proposerAccounts,
        rbac.executorAccounts,
        rbac.cancellerAccounts,
        s.timestamps,
    );
}

get getTimestamp(id: int): int {
    val s = loadData();

    var (timestampSlice, exists) = s.timestamps.uDictGet(256, id);
    if (!exists) {
        return 0;
    }

    return timestampSlice!.loadUint(32);
}

get getHashOperation(tonValue: int, predecessor: int, salt: int, account: address, msgToSend: cell): int {
    return hashOperation(tonValue, predecessor, salt, account, msgToSend);
}

get getOperationState(id: int): int {
    val s = loadData();

    var (timestampSlice, exists) = s.timestamps.uDictGet(256, id);
    if (!exists) {
        return UNSET_STATE;
    }

    var timestamp = timestampSlice!.loadUint(32);
    if (timestamp == DONE_TIMESTAMP) {
        return DONE_STATE;
    }

    if (timestamp > blockchain.now()) {
        return WAITING_STATE;
    }

    return READY_STATE;
}

get getHasRole(role: int, account: address): bool {
    val s = loadData();
    return RBACAccessControl.fromCell(s.rbac).get_getHasRole(role, account)
}

tolk 1.0

import "../../../lib/access/access_control.tolk";

import "./storage.tolk";
import "./operation_utils.tolk";
import "./params.tolk";

get fun getTimelockControllerData(): (int, int, dict, dict) {
    val s = loadData();
    val rbac = AccessControl_Data.fromCell(s.rbac);

    return (
        s.minDelay,
        s.timestampCount,
        s.timestamps,
        rbac.roles,
    );
}

get fun getTimestamp(id: int): int {
    val s = loadData();

    var (timestampSlice, exists) = s.timestamps.uDictGet(256, id);
    if (!exists) {
        return 0;
    }

    return timestampSlice!.loadUint(32);
}

get fun getHashOperation(tonValue: int, predecessor: int, salt: int, account: address, msgToSend: cell): int {
    return hashOperation(tonValue, predecessor, salt, account, msgToSend);
}

get fun getOperationState(id: int): int {
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

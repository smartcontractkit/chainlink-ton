import "./storage.tolk";
import "./operation_utils.tolk";
import "./params.tolk";
import "../common/accounts.tolk";

get getTimelockControllerData(): (int, int, dict, dict, dict, dict, dict) {
    loadStorage();
    return (
        STORAGE_MIN_DELAY,
        STORAGE_TIMESTAMP_COUNT,
        STORAGE_ADMIN_ACCOUNTS,
        STORAGE_PROPOSER_ACCOUNTS,
        STORAGE_EXECUTOR_ACCOUNTS,
        STORAGE_CANCELLER_ACCOUNTS,
        STORAGE_TIMESTAMPS
    );
}

get getTimestamp(id: int): int {
    loadStorage();

    var (timestampSlice, exists) = STORAGE_TIMESTAMPS.uDictGet(256, id);
    if (!exists) {
        return 0;
    }

    return timestampSlice!.loadUint(32);
}

get getHashOperation(tonValue: int, predecessor: int, salt: int, account: slice, msgToSend: cell): int {
    loadStorage();

    return hashOperation(tonValue, predecessor, salt, account, msgToSend);
}

get getOperationState(id: int): int {
    loadStorage();

    var (timestampSlice, exists) = STORAGE_TIMESTAMPS.uDictGet(256, id);
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

get getHasRole(role: int, account: slice): bool {
    loadStorage();

    if (role > EXECUTOR_ROLE) {
        return false;
    }

    var accounts = STORAGE_ADMIN_ACCOUNTS;

    if (role == PROPOSER_ROLE) {
        accounts = STORAGE_PROPOSER_ACCOUNTS;
    }

    if (role == CANCELLER_ROLE) {
        accounts = STORAGE_CANCELLER_ACCOUNTS;
    }

    if (role == EXECUTOR_ROLE) {
        accounts = STORAGE_EXECUTOR_ACCOUNTS;
    }

    var (_, exists) = accountExists(accounts, account);

    return exists;
}

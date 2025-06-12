tolk 0.99

import "../../../lib/access/access_control.tolk";

// RBACTimelock contract storage, auto-serialized to/from cells.
struct Storage {
    // id: uint32;          // required to allow multiple independent instances, since contract address depends on initial state

    minDelay: uint32;       // minimum delay for operations in seconds
    timestampCount: int32;  // number of timestamps stored, used to track the size of the storage
    timestamps: dict;       // maps operation id to timestamp

    rbac: Cell<RBACAccessControl>;
}

// load contract data using auto-deserialization
@inline
fun loadData() {
    return Storage.fromCell(contract.getData());
}

// save contract data into persistent storage using auto-serialization
@inline
fun saveData(data: Storage) {
    contract.setData(data.toCell());
}

// TODO: remove globals
global STORAGE_MIN_DELAY: int;
global STORAGE_TIMESTAMP_COUNT: int;
global STORAGE_ADMIN_ACCOUNTS: dict;
global STORAGE_PROPOSER_ACCOUNTS: dict;
global STORAGE_EXECUTOR_ACCOUNTS: dict;
global STORAGE_CANCELLER_ACCOUNTS: dict;
global STORAGE_TIMESTAMPS: dict;

@inline
fun loadStorage() { 
    val s = loadData();
    STORAGE_MIN_DELAY = s.minDelay;
    STORAGE_TIMESTAMP_COUNT = s.timestampCount;
    STORAGE_TIMESTAMPS = s.timestamps;

    // Load RBAC accounts from the serialized data
    var rbac = RBACAccessControl.fromCell(s.rbac);
    STORAGE_ADMIN_ACCOUNTS = rbac.adminAccounts;
    STORAGE_PROPOSER_ACCOUNTS = rbac.proposerAccounts;
    STORAGE_EXECUTOR_ACCOUNTS = rbac.executorAccounts;
    STORAGE_CANCELLER_ACCOUNTS = rbac.cancellerAccounts;
}

@inline
fun saveStorage() {
    var rbac = RBACAccessControl{
        adminAccounts: STORAGE_ADMIN_ACCOUNTS,
        proposerAccounts: STORAGE_PROPOSER_ACCOUNTS,
        executorAccounts: STORAGE_EXECUTOR_ACCOUNTS,
        cancellerAccounts: STORAGE_CANCELLER_ACCOUNTS,
    };
    saveData(Storage{
        minDelay: STORAGE_MIN_DELAY,
        timestampCount: STORAGE_TIMESTAMP_COUNT,
        timestamps: STORAGE_TIMESTAMPS,
        rbac: rbac.toCell(),
    });
}

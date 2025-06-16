tolk 0.99

import "../../../lib/access/access_control.tolk";

// RBACTimelock contract storage, auto-serialized to/from cells.
struct Storage {
    // id: uint32;          // required to allow multiple independent instances, since contract address depends on initial state

    minDelay: uint32;       // minimum delay for operations in seconds
    timestampCount: int32;  // number of timestamps stored, used to track the size of the storage
    timestamps: dict;       // maps operation id to timestamp

    rbac: Cell<AccessControl_Data>;
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

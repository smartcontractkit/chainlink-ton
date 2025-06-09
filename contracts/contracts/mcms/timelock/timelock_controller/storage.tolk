global STORAGE_MIN_DELAY: int;
global STORAGE_TIMESTAMP_COUNT: int;
global STORAGE_ADMIN_ACCOUNTS: dict;
global STORAGE_PROPOSER_ACCOUNTS: dict;
global STORAGE_EXECUTOR_ACCOUNTS: dict;
global STORAGE_CANCELLER_ACCOUNTS: dict;
global STORAGE_TIMESTAMPS: dict;

@inline
fun loadStorage() {
    var ds = contract.getData().beginParse();
    STORAGE_MIN_DELAY = ds.loadUint(32);
    STORAGE_TIMESTAMP_COUNT = ds.loadUint(32);
    var ref = ds.loadRef();
    var refDs = ref.beginParse();
    STORAGE_ADMIN_ACCOUNTS = refDs.loadDict();
    STORAGE_PROPOSER_ACCOUNTS = refDs.loadDict();
    STORAGE_EXECUTOR_ACCOUNTS = refDs.loadDict();
    STORAGE_CANCELLER_ACCOUNTS = refDs.loadDict();
    STORAGE_TIMESTAMPS = ds.loadDict();
}

@inline
fun saveStorage() {
    contract.setData(beginCell()
        .storeUint(STORAGE_MIN_DELAY, 32)
        .storeUint(STORAGE_TIMESTAMP_COUNT, 32)
        .storeRef(beginCell()
            .storeDict(STORAGE_ADMIN_ACCOUNTS)
            .storeDict(STORAGE_PROPOSER_ACCOUNTS)
            .storeDict(STORAGE_EXECUTOR_ACCOUNTS)
            .storeDict(STORAGE_CANCELLER_ACCOUNTS)
            .endCell()
        )
        .storeDict(STORAGE_TIMESTAMPS)
    .endCell());
}

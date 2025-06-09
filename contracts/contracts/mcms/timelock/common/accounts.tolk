import "../timelock_controller/error.tolk";

@inline
fun accountExists(accounts: dict, account: slice): (int, bool) {
    val (_, key) = parseStandardAddress(account);
    val (_, exists) = accounts.uDictGet(256, key);
    return (key, exists);
}

@inline
fun addAccount(mutate accounts: dict, account: slice): dict {
    val (key, exists) = accountExists(accounts, account);
    assert(!exists, ERROR_ACCOUNT_EXISTS);

    accounts.uDictSet(256, key, beginCell().endCell().beginParse());
    return accounts;
}

@inline
fun removeAccount(mutate accounts: dict, account: slice): dict {
    val (key, exists) = accountExists(accounts, account);
    assert(exists, ERROR_ACCOUNT_NOT_EXISTS);

    accounts.uDictDelete(256, key);
    return accounts;
}

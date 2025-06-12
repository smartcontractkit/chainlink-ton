tolk 0.99

import "../timelock_controller/error.tolk";

@inline
fun accountExists(accounts: dict, account: address): (int, bool) {
    val (_, key) = account.getWorkchainAndHash();
    val (_, exists) = accounts.uDictGet(256, key);
    return (key, exists);
}

@inline
fun addAccount(mutate accounts: dict, account: address): dict {
    val (key, exists) = accountExists(accounts, account);
    assert(!exists, ERROR_ACCOUNT_EXISTS);

    accounts.uDictSet(256, key, beginCell().endCell().beginParse());
    return accounts;
}

@inline
fun removeAccount(mutate accounts: dict, account: address): dict {
    val (key, exists) = accountExists(accounts, account);
    assert(exists, ERROR_ACCOUNT_NOT_EXISTS);

    accounts.uDictDelete(256, key);
    return accounts;
}

tolk 0.99

const OP_UPDATE_ACCOUNTS = 0x1f6ce878; // "OP_UPDATE_ACCOUNTS"c; // 0x1f6ce878

// TODO: figure out error codes
const ERROR_INVALID_ROLE = 89;
const ERROR_ACCOUNT_EXISTS = 95;
const ERROR_ACCOUNT_NOT_EXISTS = 96;

struct RBACAccessControl {
    adminAccounts: dict,
    proposerAccounts: dict,
    executorAccounts: dict,
    cancellerAccounts: dict,
}

const ADMIN_ROLE = 0;
const PROPOSER_ROLE = 1;
const CANCELLER_ROLE = 2;
const EXECUTOR_ROLE = 3;
const ADD_ACCOUNT = 0;
const REMOVE_ACCOUNT = 1;

@inline
fun RBACAccessControl.onInternalMessage(mutate self, op: int, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    if (op == OP_UPDATE_ACCOUNTS) {
        val operation = msgBody.loadUint(1);
        val role = msgBody.loadUint(32);
        val account = msgBody.loadAddress();
        msgBody.assertEnd();

        assert(role <= EXECUTOR_ROLE, ERROR_INVALID_ROLE);

        if (role == ADMIN_ROLE) {
            if (operation == ADD_ACCOUNT) {
                addAccount(mutate self.adminAccounts, account);
            } else {
                removeAccount(mutate self.adminAccounts, account);
            }
        }

        if (role == PROPOSER_ROLE) {
            if (operation == ADD_ACCOUNT) {
                addAccount(mutate self.proposerAccounts, account);
            } else {
                removeAccount(mutate self.proposerAccounts, account);
            }
        }

        if (role == CANCELLER_ROLE) {
            if (operation == ADD_ACCOUNT) {
                addAccount(mutate self.cancellerAccounts, account);
            } else {
                removeAccount(mutate self.cancellerAccounts, account);
            }
        }

        if (role == EXECUTOR_ROLE) {
            if (operation == ADD_ACCOUNT) {
                addAccount(mutate self.executorAccounts, account);
            } else {
                removeAccount(mutate self.executorAccounts, account);
            }
        }

        return -1;
    }

    // We didn't handle the message, so we return 0
    return 0;
}

fun RBACAccessControl.get_getHasRole(self, role: int, account: address): bool {
    if (role > EXECUTOR_ROLE) {
        return false;
    }

    var accounts = self.adminAccounts;

    if (role == PROPOSER_ROLE) {
        accounts = self.proposerAccounts;
    }

    if (role == CANCELLER_ROLE) {
        accounts = self.cancellerAccounts;
    }

    if (role == EXECUTOR_ROLE) {
        accounts = self.executorAccounts;
    }

    var (_, exists) = accountExists(accounts, account);
    return exists;
}

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

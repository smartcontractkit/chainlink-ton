tolk 0.99

const OP_UPDATE_ACCOUNTS = 0x1f6ce878; // "OP_UPDATE_ACCOUNTS"c; // 0x1f6ce878

// --- Message structs ---

/// @dev Grants `role` to `account`.
///
/// If `account` had not been already granted `role`, emits a {RoleGranted} event.
///
/// Requirements:
///
/// - the caller must have ``role``'s admin role.
///
/// May emit a {RoleGranted} event.
///
struct AccessControl_GrantRole {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// Role of the account.
    role: uint32;
    /// New account to add.
    account: address;
}

/// @dev Revokes `role` from `account`.
///
/// If `account` had been granted `role`, emits a {RoleRevoked} event.
///
/// Requirements:
///
/// - the caller must have ``role``'s admin role.
///
/// May emit a {RoleRevoked} event.
///
struct AccessControl_RevokeRole {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// Role of the account.
    role: uint32;
    /// New account to add.
    account: address;
}

// --- Error codes ---

// TODO: figure out error codes
const ERROR_INVALID_ROLE = 89;
const ERROR_ACCOUNT_EXISTS = 95;
const ERROR_ACCOUNT_NOT_EXISTS = 96;
const ERROR_ACCOUNT_MISSING_ROLE = 98;

// TODO: remove static roles and use dynamic roles instead
const ADMIN_ROLE = 0;
const PROPOSER_ROLE = 1;
const CANCELLER_ROLE = 2;
const EXECUTOR_ROLE = 3;

// TODO: remove sub-op int and use message structs instead
const ADD_ACCOUNT = 0;
const REMOVE_ACCOUNT = 1;

struct AccessControl {
    adminAccounts: dict,
    proposerAccounts: dict,
    executorAccounts: dict,
    cancellerAccounts: dict,
}

@inline
fun AccessControl.onInternalMessage(mutate self, op: int, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    // TODO: update tests to work with this check
    // self.onlyRole(ADMIN_ROLE, msgFull);

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

/// @dev Modifier that checks that an account has a specific role. Reverts
/// with a standardized message including the required role.
///
/// Format of the revert message is described in {_checkRole}.
///
@inline
fun AccessControl.onlyRole(self, role: int, msgFull: cell) {
    self.checkRoleSender(role, msgFull)
}

// @dev Returns `true` if `account` has been granted `role`.
@inline
fun AccessControl.hasRole(self, role: int, account: address): bool {
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

/// @dev Revert with a standard message if `_msgSender()` is missing `role`.
///
/// Format of the revert message is described in {_checkRole}.
///
@inline
fun AccessControl.checkRoleSender(self, role: int, msgFull: cell) {
    val sender = msgFull.beginParse().loadAddress();
    if (!self.hasRole(role, sender)) {
        throw(ERROR_ACCOUNT_MISSING_ROLE, "AccessControl: account ${account} is missing role ${role}");
    }
}

/// @dev Revert with a standard message if `account` is missing `role`.
///
/// The format of the revert reason is given by the following regular expression:
///
/// /^AccessControl: account (0x[0-9a-f]{40}) is missing role (0x[0-9a-f]{64})$/
///
@inline
fun AccessControl.checkRole(self, role: int, account: address) {
    if (!self.hasRole(role, account)) {
        throw(ERROR_ACCOUNT_MISSING_ROLE, "AccessControl: account ${account} is missing role ${role}");
    }
}

// --- Getters ---

/// @dev getter to export by the contract
@inline
fun AccessControl.get_hasRole(self, role: int, account: address): bool {
   return self.hasRole(role, account)
}

// --- Utils ---

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

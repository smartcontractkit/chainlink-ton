tolk 0.99

import "@stdlib/tvm-dicts";

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
struct (0x95cd540f) AccessControl_GrantRole {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// Role of the account.
    role: uint256;
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
struct (0x969b0db9) AccessControl_RevokeRole {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// Role of the account.
    role: uint256;
    /// Account to revoke.
    account: address;
}

/// @dev Revokes `role` from the calling account.
///
/// Roles are often managed via {grantRole} and {revokeRole}: this function's
/// purpose is to provide a mechanism for accounts to lose their privileges
/// if they are compromised (such as when a trusted device is misplaced).
///
/// If `account` had been granted `role`, emits a {RoleRevoked} event.
///
/// Requirements:
///
/// - the caller must be `callerConfirmation`.
///
/// May emit a {RoleRevoked} event.
///
struct (0x39452c46) AccessControl_RenounceRole {
    /// Query ID of the change owner request.
    queryId: uint64;

    /// Role of the account.
    role: uint256;
    /// Account to revoke.
    callerConfirmation: address;
}

/// @dev Union of all access control messages.
type AccessControl_Message = AccessControl_GrantRole | AccessControl_RevokeRole | AccessControl_RenounceRole;

// --- Storage structs ---

// AccessControl storage struct, auto-serialized to/from cells.
struct AccessControl<T> {
    data: AccessControl_Data;

    // Runtime hooks (extensions)
    context: T?,
    hooks: AccessControl_Hooks<T>?;
}

/// AccessControl data struct, auto-serialized to/from cells.
struct AccessControl_Data {
    roles: dict;
}

/// Internal storage struct for role data
///
/// Each role has a mapping of accounts that have been granted that role,
/// and an admin role that can manage that role. 
struct AccessControl_RoleData {
    hasRole: dict;
    adminRole: uint256;
}

// --- Hooks struct (extensions) ---

struct AccessControl_Hooks<T> {
    // Hook to get the sender of the message.
    _msgSender: ((T, cell) -> address)?;

    // Hook to grant a role.
    grantRole: ((T, uint64, int, address, cell) -> bool)?;

    // Hook to revoke a role.
    revokeRole: ((T, uint64, int, address, cell) -> bool)?;

    // Hook (underlying) to grant a role.
    _grantRole: ((T, uint64, int, address) -> bool)?;

    // Hook (underlying) to revoke a role.
    _revokeRole: ((T, uint64, int, address) -> bool)?;
}

// --- Constants ---

const DEFAULT_ADMIN_ROLE = 0x00;

const ERROR_ACCESS_CONTROL_UNOTHORIZED_ACCOUNT = 90;
const ERROR_ACCESS_CONTROL_BAD_CONFIRMATION = 91;

// --- Methods ---

/// @dev Returns the sender of the message.
///
/// Override available via {AccessControl_Hooks<T>._msgSender} hook.
fun AccessControl<T>._msgSender(self, msgFull: cell): address {
    if (self.hooks != null && self.hooks._msgSender != null) {
        return self.hooks._msgSender(self.context!, msgFull); // extension hook
    }

    // Fallback to parsing the message body to get the sender
    return msgFull.beginParse()
        .skipBits(4) // skip msgFlags from incoming message body (4 bits).
        .loadAddress();
}

/// @dev Modifier that checks that an account has a specific role. Reverts
/// with a standardized message including the required role.
///
/// Format of the revert message is described in {_checkRole}.
@inline
fun AccessControl<T>.onlyRole(self, role: int, msgFull: cell) {
    self.checkRoleSender(role, msgFull)
}

// @dev Returns `true` if `account` has been granted `role`.
fun AccessControl<T>.hasRole(self, role: int, account: address): bool {
    // Check if the role is valid
    val (data, exists) = self.data.roles.uDictGet(256, role);
    if (!exists) {
        return false;
    }

    return true; // TODO: REMOVE THIS LINE (debugging purpose)

    // Check if the account exists in the role data
    val d = AccessControl_RoleData.fromSlice(data!);
    val (_, key) = account.getWorkchainAndHash();
    val (_, accExists) = d.hasRole.uDictGet(256, key);
    return accExists;
}

/// @dev Revert with a standard message if `_msgSender()` is missing `role`.
///
/// Format of the revert message is described in {_checkRole}.
fun AccessControl<T>.checkRoleSender(self, role: int, msgFull: cell) {
    val sender = self._msgSender(msgFull);
    self.checkRole(role, sender);
}

/// @dev Revert with a standard message if `account` is missing `role`.
///
/// The format of the revert reason is given by the following regular expression:
///
/// /^AccessControl: account (0x[0-9a-f]{40}) is missing role (0x[0-9a-f]{64})$/
///
fun AccessControl<T>.checkRole(self, role: int, account: address) {
    if (!self.hasRole(role, account)) {
        throw(ERROR_ACCESS_CONTROL_UNOTHORIZED_ACCOUNT); // TODO: attach error arguments
    }
}

/// @dev Returns the admin role that controls `role`. See {grantRole} and {revokeRole}.
///
/// To change a role's admin, use {setRoleAdmin}.
fun AccessControl<T>.getRoleAdmin(self, role: int): int {
    val (data, exists) = self.data.roles.uDictGet(256, role);
    if (!exists) {
        return DEFAULT_ADMIN_ROLE;
    }

    return AccessControl_RoleData.fromSlice(data!).adminRole;
}

/// @dev Grants `role` to `account`.
///
/// Requirements:
/// - the caller must have `role`'s admin role.
///
/// Emits a {RoleGranted} event if `role` was granted.
/// Override available via {AccessControl_Hooks<T>.grantRole} hook.
fun AccessControl<T>.grantRole(mutate self, queryId: uint64, role: int, account: address, msgFull: cell): bool {
    if (self.hooks != null && self.hooks.grantRole != null) {
        return self.hooks.grantRole(self.context!, queryId, role, account, msgFull); // extension hook
    }

    self.onlyRole(self.getRoleAdmin(role), msgFull);
    return self._grantRole(queryId, role, account); // default implementation
}

/// @dev Revokes `role` from `account`.
///
/// Requirements:
/// - the caller must have `role`'s admin role.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
/// Override available via {AccessControl_Hooks<T>.revokeRole} hook.
fun AccessControl<T>.revokeRole(mutate self, queryId: uint64, role: int, account: address, msgFull: cell): bool {
    if (self.hooks != null && self.hooks.revokeRole != null) {
        return self.hooks.revokeRole(self.context!, queryId, role, account, msgFull); // extension hook
    }

    self.onlyRole(self.getRoleAdmin(role), msgFull);
    return self._revokeRole(queryId, role, account);
}

/// @dev Revokes `role` from the calling account.
///
/// Roles are often managed via {grantRole} and {revokeRole}: this function's
/// purpose is to provide a mechanism for accounts to lose their privileges
/// if they are compromised (such as when a trusted device is misplaced).
///
/// If the calling account had been revoked `role`, emits a {RoleRevoked} event.
///
/// Requirements:
///
/// - the caller must be `callerConfirmation`.
///
/// May emit a {RoleRevoked} event.
fun AccessControl<T>.renounceRole(mutate self, queryId: uint64, role: int, callerConfirmation: address, msgFull: cell): bool {
    val sender = self._msgSender(msgFull);
    if (callerConfirmation != sender) {
        throw(ERROR_ACCESS_CONTROL_BAD_CONFIRMATION); // TODO: attach error arguments
    }

    // Renouncing a role is equivalent to revoking it from the caller
    return self.revokeRole(queryId, role, callerConfirmation, msgFull);
}

/// @dev Sets `adminRole` as `role`'s admin role.
///
/// Emits a {RoleAdminChanged} event.
fun AccessControl<T>._setRoleAdmin(mutate self, queryId: uint64, role: int, adminRole: int) {
    var d: AccessControl_RoleData = self.data.getRoleDataOrSetDefault(role);
    val previousAdminRole = d.adminRole;
    // Update the admin role for the role
    d.adminRole = adminRole;

    // Save the updated role data
    self.data.roles.uDictSet(256, role, d.toCell().beginParse());
    // TODO: emit RoleAdminChanged(role, previousAdminRole, adminRole);
}

/// @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
///
/// Internal function without access restriction.
///
/// Emits a {RoleGranted} event if `role` was granted.
fun AccessControl<T>._grantRole(mutate self, queryId: uint64, role: int, account: address): bool {
    if (self.hooks != null && self.hooks._grantRole != null) {
        return self.hooks._grantRole(self.context!, queryId, role, account); // extension hook
    }

    // Default implementation of granting a role
    var d: AccessControl_RoleData = self.data.getRoleDataOrSetDefault(role);

    // Check if the account exists in the role data
    val (_, key) = account.getWorkchainAndHash();
    val (_, exists) = d.hasRole.uDictGet(256, key);

    if (exists) {
        return false; // nothing to do
    }

    // Add the account to the role
    d.hasRole.uDictSet(256, key, createEmptySlice());
    // TODO: emit RoleGranted(role, account, _msgSender());

    // Save the updated role data
    self.data.roles.uDictSet(256, role, d.toCell().beginParse());
    return true; // role granted successfully
}

/// @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
///
/// Internal function without access restriction.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
fun AccessControl<T>._revokeRole(mutate self, queryId: uint64, role: int, account: address): bool {
    if (self.hooks != null && self.hooks._revokeRole != null) {
        return self.hooks._revokeRole(self.context!, queryId, role, account); // extension hook
    }

    // Default implementation of revoking a role
    var d: AccessControl_RoleData = self.data.getRoleDataOrSetDefault(role);

    // Check if the account exists in the role data
    val (_, key) = account.getWorkchainAndHash();
    val (_, exists) = d.hasRole.uDictGet(256, key);

    if (!exists) {
        return false; // nothing to do
    }

    // Remove the account from the role
    d.hasRole.uDictDelete(256, key);
    // TODO: emit RoleRevoked(role, account, _msgSender());

    // Save the updated role data
    self.data.roles.uDictSet(256, role, d.toCell().beginParse());
    return true; // role revoked successfully
}

/// --- Helpers ---

@inline
fun AccessControl_Data.getRoleDataOrSetDefault(mutate self, role: int): AccessControl_RoleData {
    // Check if the role is valid
    val (data, exists) = self.roles.uDictGet(256, role);
    if (exists) {
        return AccessControl_RoleData.fromSlice(data!);
    }

    // Create a new role data if it doesn't exist
    var _data: AccessControl_RoleData = {
        hasRole: createEmptyDict(),
        adminRole: DEFAULT_ADMIN_ROLE
    };
    self.roles.uDictSet(256, role, _data.toCell().beginParse());
    return _data;
}

// --- Getters ---

/// @dev getter to export by the contract
@inline
fun AccessControl<T>.get_hasRole(self, role: int, account: address): bool {
   return self.hasRole(role, account)
}

/// @dev getter to export by the contract
@inline
fun AccessControl<T>.get_getRoleAdmin(self, role: int): int {
   return self.getRoleAdmin(role)
}

// --- Message handler ---

@inline
fun AccessControl<T>.onInternalMessage(mutate self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    var msg: AccessControl_Message;
    try {
        msg = AccessControl_Message.fromSlice(msgBody);
    } catch(exitCode) {
        return 0; // unknown message, not handled
    }

    match (msg) {
        AccessControl_GrantRole => {
            self.grantRole(msg.queryId, msg.role, msg.account, msgFull);
        },
        AccessControl_RevokeRole => {
            self.revokeRole(msg.queryId, msg.role, msg.account, msgFull);
        },
        AccessControl_RenounceRole => {
            self.renounceRole(msg.queryId, msg.role, msg.callerConfirmation, msgFull);
        },
    };
    return -1; // handled
}

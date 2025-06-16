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

/// @dev Union of all access control messages.
type AccessControl_Message = AccessControl_GrantRole | AccessControl_RevokeRole;

// --- Storage structs ---

/// Internal storage struct for role data
///
/// Each role has a mapping of accounts that have been granted that role,
/// and an admin role that can manage that role. 
struct RoleData {
    hasRole: dict;
    adminRole: uint256;
}

// AccessControl storage struct, auto-serialized to/from cells.
struct AccessControl {
    roles: dict;
}

// --- Constants ---

const DEFAULT_ADMIN_ROLE = 0x00;

const ERROR_ACCESS_CONTROL_UNOTHORIZED_ACCOUNT = 90;
const ERROR_ACCESS_CONTROL_BAD_CONFIRMATION = 91;

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
fun AccessControl.hasRole(self, role: int, account: address): bool {
    // Check if the role is valid
    val (data, exists) = self.roles.uDictGet(256, role);
    if (!exists) {
        return false;
    }
    
    // Check if the account exists in the role data
    val d = RoleData.fromSlice(data!);
    val (_, key) = account.getWorkchainAndHash();
    val (_, accExists) = d.hasRole.uDictGet(256, key);
    return accExists;
}

/// @dev Revert with a standard message if `_msgSender()` is missing `role`.
///
/// Format of the revert message is described in {_checkRole}.
///
fun AccessControl.checkRoleSender(self, role: int, msgFull: cell) {
    val sender = msgFull.beginParse()
        .skipBits(4) // skip msgFlags from incoming message body (4 bits).
        .loadAddress();
    self.checkRole(role, sender);
}

/// @dev Revert with a standard message if `account` is missing `role`.
///
/// The format of the revert reason is given by the following regular expression:
///
/// /^AccessControl: account (0x[0-9a-f]{40}) is missing role (0x[0-9a-f]{64})$/
///
fun AccessControl.checkRole(self, role: int, account: address) {
    if (!self.hasRole(role, account)) {
        throw(ERROR_ACCESS_CONTROL_UNOTHORIZED_ACCOUNT); // TODO: attach error arguments
    }
}

/// @dev Returns the admin role that controls `role`. See {grantRole} and {revokeRole}.
///
/// To change a role's admin, use {setRoleAdmin}.
fun AccessControl.getRoleAdmin(self, role: int): int {
    val (data, exists) = self.roles.uDictGet(256, role);
    if (!exists) {
        return DEFAULT_ADMIN_ROLE;
    }

    return RoleData.fromSlice(data!).adminRole;
}

// --- Getters ---

/// @dev getter to export by the contract
@inline
fun AccessControl.get_hasRole(self, role: int, account: address): bool {
   return self.hasRole(role, account)
}

/// @dev getter to export by the contract
@inline
fun AccessControl.get_getRoleAdmin(self, role: int): int {
   return self.getRoleAdmin(role)
}

// --- Message handler ---

@inline
fun AccessControl.onInternalMessage(mutate self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    val msg = AccessControl.messageFromSlice(msgBody);
    if (msg == null) {
        return 0; // unknown message, not handled
    }

    match (msg) {
        AccessControl_GrantRole => {
            self.onlyRole(self.getRoleAdmin(msg.role), msgFull);
            self.grantRole(msg.queryId, msg.role, msg.account);
        },
        AccessControl_RevokeRole => {
            self.onlyRole(self.getRoleAdmin(msg.role), msgFull);
            self.revokeRole(msg.queryId, msg.role, msg.account);
        },
    };
    return -1; // handled
}

// --- Internal helpers ---

@inline
fun AccessControl.messageFromSlice(msgBody: slice) {
    try {
        return AccessControl_Message.fromSlice(msgBody);
    } catch(exitCode) {
        return null; // 63 is the error code for unknown opcode
    }
}

@inline
fun AccessControl.getRoleDataOrSetDefault(mutate self, role: int): RoleData {
    // Check if the role is valid
    val (data, exists) = self.roles.uDictGet(256, role);
    if (exists) {
        return RoleData.fromSlice(data!);
    }

    // Create a new role data if it doesn't exist
    var _data: RoleData = {
        hasRole: createEmptyDict(),
        adminRole: DEFAULT_ADMIN_ROLE
    };
    self.roles.uDictSet(256, role, _data.toCell().beginParse());
    return _data;
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
fun AccessControl.renounceRole(mutate self, queryId: uint64, role: int, callerConfirmation: address, msgFull: cell): bool {
    val sender = msgFull.beginParse()
        .skipBits(4) // skip msgFlags from incoming message body (4 bits).
        .loadAddress();
    if (callerConfirmation != sender) {
        throw(ERROR_ACCESS_CONTROL_BAD_CONFIRMATION); // TODO: attach error arguments
    }

    // Renouncing a role is equivalent to revoking it from the caller
    return self.revokeRole(queryId, role, callerConfirmation);
}

/// @dev Sets `adminRole` as `role`'s admin role.
///
/// Emits a {RoleAdminChanged} event.
fun AccessControl.setRoleAdmin(mutate self, queryId: uint64, role: int, adminRole: int) {
    var d: RoleData = self.getRoleDataOrSetDefault(role);
    val previousAdminRole = d.adminRole;
    // Update the admin role for the role
    d.adminRole = adminRole;

    // Save the updated role data
    self.roles.uDictSet(256, role, d.toCell().beginParse());
    // TODO: emit RoleAdminChanged(role, previousAdminRole, adminRole);
}

/// @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
///
/// Internal function without access restriction.
///
/// Emits a {RoleGranted} event if `role` was granted. 
fun AccessControl.grantRole(mutate self, queryId: uint64, role: int, account: address): bool {
    var d: RoleData = self.getRoleDataOrSetDefault(role);

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
    self.roles.uDictSet(256, role, d.toCell().beginParse());
    return true; // role granted successfully
}

/// @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
///
/// Internal function without access restriction.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
fun AccessControl.revokeRole(mutate self, queryId: uint64, role: int, account: address): bool {
    var d: RoleData = self.getRoleDataOrSetDefault(role);

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
    self.roles.uDictSet(256, role, d.toCell().beginParse());
    return true; // role revoked successfully
}

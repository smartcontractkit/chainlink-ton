tolk 1.0

import "@stdlib/tvm-dicts";
import "../utils.tolk";

const LEN_ADDRESS = 267;  // '100' (std addr no anycast) + workchain 8 + hash LEN_ROLE
const LEN_ROLE = 256; // LEN_ROLE bits for role ID

// --- Message structs ---

/// @dev Grants `role` to `account`.
///
/// If `account` had not been already granted `role`, emits a {RoleGranted} event.
///
/// Requirements:
///
/// - the caller must have `role`'s admin role.
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
/// - the caller must have `role`'s admin role.
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
    adminRole: uint256;

    // Number of members in the role
    membersLen: uint64;
    // Members of the role, indexed by their address hash.
    hasRole: dict;
}

// --- Hooks struct (extensions) ---

struct AccessControl_Hooks<T> {
    // Hook to get the sender of the message.
    msgSender: ((T, cell) -> address)?;

    // Hook before granting a role.
    shouldGrantRole: ((T, uint64, int, address) -> void)?;

    // Hook before revoking a role.
    shouldRevokeRole: ((T, uint64, int, address) -> void)?;
}

// --- Constants ---

const DEFAULT_ADMIN_ROLE = 0x00;

const ERROR_ACCESS_CONTROL_UNOTHORIZED_ACCOUNT = 90;
const ERROR_ACCESS_CONTROL_BAD_CONFIRMATION = 91;

// --- Methods ---

/// @dev Returns the sender of the message.
///
/// Override available via {AccessControl_Hooks<T>.msgSender} hook.
fun AccessControl<T>.msgSender(self, msgFull: cell): address {
    if (self.hooks != null && self.hooks.msgSender != null) {
        return self.hooks.msgSender(self.context!, msgFull); // extension hook
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
    val (data, exists) = self.data.roles.uDictGetRef(LEN_ROLE, role);
    if (!exists) {
        return false;
    }

    // Check if the account exists in the role data
    val d = AccessControl_RoleData.fromCell(data!);
    val (_, accExists) = d.hasRole.sDictGet(LEN_ADDRESS, account as slice);
    return accExists;
}

/// @dev Revert with a standard message if `msgSender()` is missing `role`.
///
/// Format of the revert message is described in {_checkRole}.
fun AccessControl<T>.checkRoleSender(self, role: int, msgFull: cell) {
    val sender = self.msgSender(msgFull);
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
    val (data, exists) = self.data.roles.uDictGetRef(LEN_ROLE, role);
    if (!exists) {
        return DEFAULT_ADMIN_ROLE;
    }

    return AccessControl_RoleData.fromCell(data!).adminRole;
}

// --- Methods - <AccessControl<T>> enumerable extension ---

/// @dev Returns one of the accounts that have `role`. `index` must be a
/// value between 0 and {getRoleMemberCount}, non-inclusive.
///
/// This function is useful for enumerating all accounts that have a role, but is expensive
/// in terms of gas. It is recommended to use {getRoleMemberFirst} and {getRoleMemberNext}
/// to iterate through the accounts in a more gas-efficient way.
///
/// Role bearers are not sorted in any particular way, and their ordering may change at any point.
@inline
fun AccessControl<T>.getRoleMember(self, role: int, index: uint32): address {
    // Check if the role is valid
    val (data, exists) = self.data.roles.uDictGetRef(LEN_ROLE, role);
    if (!exists) {
        return createAddressNone(); // role does not exist
    }

    // Check if the account exists in the role data
    var d = AccessControl_RoleData.fromCell(data!);
    if (index >= d.membersLen) {
        return createAddressNone(); // index out of bounds
    }

    // Notice: we need to iterate through the dictionary to get the account at the specified index.
    // This is not efficient, but it is the only way to get an account at index without additional data structures.
    var i = 0;
    while (i < index) {
        d.hasRole.sDictDeleteFirstAndGet(LEN_ADDRESS);
    }

    // Get the account at the specified index
    var (acc: slice?, _: slice?, _: bool) = d.hasRole.sDictDeleteFirstAndGet(LEN_ADDRESS);
    return acc! as address;
}

@inline
fun AccessControl<T>.getRoleMemberFirst(self, role: int): address {
    // Check if the role is valid
    val (data, exists) = self.data.roles.uDictGetRef(LEN_ROLE, role);
    if (!exists) {
        return createAddressNone(); // role does not exist
    }

    val d = AccessControl_RoleData.fromCell(data!);
    if (d.membersLen == 0) {
        return createAddressNone(); // no members in the role
    }

    // Get the first account in the role data
    var (acc, _, _) = d.hasRole.sDictGetFirst(LEN_ADDRESS);
    return acc! as address;
}

@inline
fun AccessControl<T>.getRoleMemberNext(self, role: int, pivot: address): address {
    // Check if the role is valid
    val (data, exists) = self.data.roles.uDictGetRef(LEN_ROLE, role);
    if (!exists) {
        return createAddressNone(); // role does not exist
    }

    // Get the next account in the role data after the pivot
    val d = AccessControl_RoleData.fromCell(data!);
    var (acc, _, accExists) = d.hasRole.sDictGetNext(LEN_ADDRESS, pivot as slice);
    if (!accExists) {
        return createAddressNone(); // no next account
    }

    return acc! as address;
}

/// @dev Returns the number of accounts that have `role`. Can be used
/// together with {getRoleMember} to enumerate all bearers of a role.
@inline
fun AccessControl<T>.getRoleMemberCount(self, role: int): int {
    // Check if the role is valid
    val (data, exists) = self.data.roles.uDictGetRef(LEN_ROLE, role);
    if (!exists) {
        return 0; // role does not exist
    }

    return AccessControl_RoleData.fromCell(data!).membersLen;
}

/// @dev Return all accounts that have `role`.
@inline
fun AccessControl<T>.getRoleMembers(self, role: int): dict {
    // Check if the role is valid
    val (data, exists) = self.data.roles.uDictGetRef(LEN_ROLE, role);
    if (!exists) {
        return createEmptyDict(); // role does not exist
    }

    return AccessControl_RoleData.fromCell(data!).hasRole;
}

// --- Methods - mutations ---

/// @dev Grants `role` to `account`.
///
/// Requirements:
/// - the caller must have `role`'s admin role.
///
/// Emits a {RoleGranted} event if `role` was granted.
fun AccessControl<T>.grantRole(mutate self, queryId: uint64, role: int, account: address, msgFull: cell): bool {
    self.onlyRole(self.getRoleAdmin(role), msgFull);
    return self._grantRole(queryId, role, account); // default implementation
}

/// @dev Revokes `role` from `account`.
///
/// Requirements:
/// - the caller must have `role`'s admin role.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
fun AccessControl<T>.revokeRole(mutate self, queryId: uint64, role: int, account: address, msgFull: cell): bool {
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
    val sender = self.msgSender(msgFull);
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
    self.data.roles.uDictSetRef(LEN_ROLE, role, d.toCell());
    // TODO: emit RoleAdminChanged(role, previousAdminRole, adminRole);
}

/// @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
///
/// Internal function without access restriction.
///
/// Emits a {RoleGranted} event if `role` was granted.
fun AccessControl<T>._grantRole(mutate self, queryId: uint64, role: int, account: address): bool {
    if (self.hooks != null && self.hooks.shouldGrantRole != null) {
        self.hooks.shouldGrantRole(self.context!, queryId, role, account); // extension hook
    }

    // Default implementation of granting a role
    var d: AccessControl_RoleData = self.data.getRoleDataOrSetDefault(role);

    // Check if the account exists in the role data
    val (_, exists) = d.hasRole.sDictGet(LEN_ADDRESS, account as slice);

    if (exists) {
        return false; // nothing to do
    }

    // Add the account to the role
    d.hasRole.sDictSet(LEN_ADDRESS, account as slice, createEmptySlice());
    d.membersLen += 1; // increment the number of members in the role
    // TODO: emit RoleGranted(role, account, msgSender());

    // Save the updated role data
    self.data.roles.uDictSetRef(LEN_ROLE, role, d.toCell());
    return true; // role granted successfully
}

/// @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
///
/// Internal function without access restriction.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
fun AccessControl<T>._revokeRole(mutate self, queryId: uint64, role: int, account: address): bool {
    if (self.hooks != null && self.hooks.shouldRevokeRole != null) {
        self.hooks.shouldRevokeRole(self.context!, queryId, role, account); // extension hook
    }

    // Default implementation of revoking a role
    var d: AccessControl_RoleData = self.data.getRoleDataOrSetDefault(role);

    // Check if the account exists in the role data
    val (_, exists) = d.hasRole.sDictGet(LEN_ADDRESS, account as slice);

    if (!exists) {
        return false; // nothing to do
    }

    // Remove the account from the role
    d.hasRole.sDictDelete(LEN_ADDRESS, account as slice);
    d.membersLen -= 1; // decrement the number of members in the role
    // TODO: emit RoleRevoked(role, account, msgSender());

    // Save the updated role data
    self.data.roles.uDictSetRef(LEN_ROLE, role, d.toCell());
    return true; // role revoked successfully
}

/// --- Helpers ---

@inline
fun AccessControl_Data.getRoleDataOrSetDefault(mutate self, role: int): AccessControl_RoleData {
    // Check if the role is valid
    val (data, exists) = self.roles.uDictGetRef(LEN_ROLE, role);
    if (exists) {
        return AccessControl_RoleData.fromCell(data!);
    }

    // Create a new role data if it doesn't exist
    var _data: AccessControl_RoleData = {
        adminRole: DEFAULT_ADMIN_ROLE,
        // Initialize hasRole as an empty dictionary
        hasRole: createEmptyDict(),
        membersLen: 0,
    };
    self.roles.uDictSetRef(LEN_ROLE, role, _data.toCell());
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

// --- Getters - <AccessControl<T>> enumerable extension ---

/// @dev getter to export downstream
@inline
fun AccessControl<T>.get_getRoleMember(self, role: int, index: uint32): address {
   return self.getRoleMember(role, index)
}

/// @dev getter to export downstream
@inline
fun AccessControl<T>.get_getRoleMemberCount(self, role: int): int {
   return self.getRoleMemberCount(role)
}

/// @dev getter to export downstream
@inline
fun AccessControl<T>.get_getRoleMembers(self, role: int): dict {
   return self.getRoleMembers(role)
}

// @dev getter to export downstream
@inline
fun AccessControl<T>.get_getRoleMemberFirst(self, role: int): address {
   return self.getRoleMemberFirst(role)
}

/// @dev getter to export downstream
@inline
fun AccessControl<T>.get_getRoleMemberNext(self, role: int, pivot: slice): address {
   return self.getRoleMemberNext(role, pivot)
}

// --- Message handlers ---

@inline
fun AccessControl<T>.onInternalMessage(mutate self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    try {
        val msg = AccessControl_Message.fromSlice(msgBody);
        return self.onInternalMessageStruct(myBalance, msgValue, msgFull, msg);
    } catch(exitCode) {
        return 0; // unknown message, not handled
    }
}

@inline
fun AccessControl<T>.onInternalMessageStruct(mutate self, myBalance: int, msgValue: int, msgFull: cell, msg: AccessControl_Message) {
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

tolk 0.99

import "../access_control.tolk";

// --- Storage structs ---

/// AccessControl storage struct, auto-serialized to/from cells.
struct AccessControlEnumerable<T> {
    // Storage
    data: AccessControlEnumerable_Data;

    // Runtime hooks (extensions)
    context: T?,
    hooks: AccessControlEnumerable_Hooks<T>?;
}

/// AccessControl data struct, auto-serialized to/from cells.
struct AccessControlEnumerable_Data {
    // Underlying access control data
    underlying: AccessControl_Data;
    // Enumerates role members
    roleMembers: dict; // maps role to list of members
}

/// Internal storage struct for role data
///
/// Each role has a mapping of accounts that have been granted that role,
/// enumerated by their index in the membersList (ordered by the time they were added). 
struct AccessControlEnumerable_RoleData {
    membersList: dict;
    membersLen: uint64; // number of members in the role
}

// --- Extension hooks (type) ---

/// Hooks for AccessControlEnumerable<T> trait (reusing AccessControl<T> hooks).
type AccessControlEnumerable_Hooks<T> = AccessControl_Hooks<T>;

// --- Internal methods ---

/// @dev Returns `true` if `account` has been granted `role`.
@inline
fun AccessControlEnumerable<T>.hasRole(self, role: int, account: address): bool {
    var super: AccessControl<T> = self.hookTrait__AccessControl();
    return super.hasRole(role, account); // default implementation
}

/// @dev Returns one of the accounts that have `role`. `index` must be a
/// value between 0 and {getRoleMemberCount}, non-inclusive.
///
/// Role bearers are not sorted in any particular way, and their ordering may change at any point.
@inline
fun AccessControlEnumerable<T>.getRoleMember(self, role: int, index: uint32): address {
    // Check if the role is valid
    val (data, exists) = self.data.roleMembers.uDictGet(256, role);
    if (!exists) {
        return createAddressNone(); // role does not exist
    }

    val members = AccessControlEnumerable_RoleData.fromSlice(data!).membersList;
    // TODO: extract indexed address from membersList
    return createAddressNone();
}

/// @dev Returns the number of accounts that have `role`. Can be used
/// together with {getRoleMember} to enumerate all bearers of a role.
@inline
fun AccessControlEnumerable<T>.getRoleMemberCount(self, role: int): int {
    // Check if the role is valid
    val (data, exists) = self.data.roleMembers.uDictGet(256, role);
    if (!exists) {
        return 0; // role does not exist
    }

    return AccessControlEnumerable_RoleData.fromSlice(data!).membersLen;
}

/// @dev Return all accounts that have `role`.
@inline
fun AccessControlEnumerable<T>.getRoleMembers(self, role: int): dict {
    // Check if the role is valid
    val (data, exists) = self.data.roleMembers.uDictGet(256, role);
    if (!exists) {
        return createEmptySlice(); // role does not exist
    }

    return AccessControlEnumerable_RoleData.fromSlice(data!).membersList;
}

/// @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
///
/// Emits a {RoleGranted} event if `role` was granted.
/// Hook available via {AccessControlEnumerable_Hooks<T>.shouldGrantRole}
fun AccessControlEnumerable<T>.grantRole(mutate self, queryId: uint64, role: int, account: address, msgFull: cell): bool {
    var super: AccessControl<T> = self.hookTrait__AccessControl();

    if (super.grantRole(queryId, role, account, msgFull)) {
        self.data.underlying = super.data; // update underlying data
        return self._addRoleMembers(role, account);
    };

    return false;
}

/// @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
/// Keeps track of the members of each role in `roleMembers`.
///
/// Internal function without access restriction.
///
/// Emits a {RoleGranted} event if `role` was granted.
/// Hook available via {AccessControlEnumerable_Hooks<T>.shouldGrantRole}
fun AccessControlEnumerable<T>._grantRole(mutate self, queryId: uint64, role: int, account: address): bool {
    var super: AccessControl<T> = self.hookTrait__AccessControl();

    if (super._grantRole(queryId, role, account)) {
        self.data.underlying = super.data; // update underlying data
        return self._addRoleMembers(role, account);
    };

    return false;
}

fun AccessControlEnumerable<T>._addRoleMembers(mutate self, role: int, account: address): bool {
    // TODO: add account to roleMembers for role
    return true;
}

/// @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
/// Hook available via {AccessControlEnumerable_Hooks<T>.shouldRevokeRole}
fun AccessControlEnumerable<T>.revokeRole(mutate self, queryId: uint64, role: int, account: address, msgFull: cell): bool {
    var super: AccessControl<T> = self.hookTrait__AccessControl();

    if (super.revokeRole(queryId, role, account, msgFull)) {
        self.data.underlying = super.data; // update underlying data
        return self._removeRoleMembers(role, account);
    };

    return false;
}

/// @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
/// Keeps track of the members of each role in `roleMembers`.
///
/// Internal function without access restriction.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
/// Hook available via {AccessControlEnumerable_Hooks<T>.shouldRevokeRole}
fun AccessControlEnumerable<T>._revokeRole(mutate self, queryId: uint64, role: int, account: address): bool {
    var super: AccessControl<T> = self.hookTrait__AccessControl();

    if (super._revokeRole(queryId, role, account)) {
        self.data.underlying = super.data; // update underlying data
        return self._removeRoleMembers(role, account);
    };

    return false;
}

fun AccessControlEnumerable<T>._removeRoleMembers(mutate self, role: int, account: address): bool {
    // TODO: remove account from roleMembers for role
    return true;
}

// --- Getters ---
// --- Getters <AccessControl<T>> (parent) ---

/// @dev getter to export downstream
@inline
fun AccessControlEnumerable<T>.get_hasRole(self, role: int, account: address): bool {
   return self.hasRole(role, account)
}

/// @dev getter to export downstream
@inline
fun AccessControlEnumerable<T>.get_getRoleAdmin(self, role: int): int {
   return self.getRoleAdmin(role)
}

// --- Getters <AccessControlEnumerable<T>> ---

/// @dev getter to export downstream
@inline
fun AccessControlEnumerable<T>.get_getRoleMember(self, role: int, index: uint32): address {
   return self.getRoleMember(role, index)
}

/// @dev getter to export downstream
@inline
fun AccessControlEnumerable<T>.get_getRoleMemberCount(self, role: int): int {
   return self.getRoleMemberCount(role)
}

/// @dev getter to export downstream
@inline
fun AccessControlEnumerable<T>.get_getRoleMembers(self, role: int): int {
   return self.getRoleMembers(role)
}

// --- Message handler ---

@inline
fun AccessControlEnumerable<T>.onInternalMessage(mutate self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    try {
        val msg = AccessControl_Message.fromSlice(msgBody);
        return self.onInternalMessageStruct(myBalance, msgValue, msgFull, msg);
    } catch(exitCode) {
        return 0; // unknown message, not handled
    }
}

@inline
fun AccessControlEnumerable<T>.onInternalMessageStruct(mutate self, myBalance: int, msgValue: int, msgFull: cell, msg: AccessControl_Message) {
    var super: AccessControl<T>
        = self.hookTrait__AccessControl(); // hook into AccessControl<T> trait

    super.onInternalMessageStruct(myBalance, msgValue, msgFull, msg);
    self.data.underlying = super.data; // update underlying data

    match (msg) {
        AccessControl_GrantRole => {
            self._addRoleMembers(msg.role, msg.account);
        },
        AccessControl_RevokeRole => {
            self._removeRoleMembers(msg.role, msg.account);
        },
        AccessControl_RenounceRole => {
            self._removeRoleMembers(msg.role, msg.callerConfirmation);
        },
    };

    return -1; // handled
}

// --- Extension hooks ---

@inline
fun AccessControlEnumerable<T>.hookTrait__AccessControl(self): AccessControl<T>{
    // Construct trait instance (with AccessControl<T>)
    return {
        data: self.data.underlying,
        // Set up runtime extensions
        context: self.context, // context to be injected into hooks
        hooks: self.hooks,
    };
}

tolk 0.99

import "../access_control.tolk";

// --- Storage structs ---

// AccessControl storage struct, auto-serialized to/from cells.
struct AccessControlEnumerable {
    // Storage
    data: AccessControlEnumerable_Data;
    // Runtime hooks (extensions)
    hooks: AccessControlEnumerable_Hooks?;
}

/// AccessControl data struct, auto-serialized to/from cells.
struct AccessControlEnumerable_Data {
    // Underlying access control data
    acData: AccessControl_Data;
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

// --- Hooks struct (extensions) ---

struct AccessControlEnumerable_Hooks {
    // Hook to get the sender of the message.
    msgSender: ((AccessControlEnumerable_Data, cell) -> address)?;
    // Hook to grant a role.
    grantRole: ((AccessControlEnumerable_Data, uint64, int, address) -> bool)?;
    // Hook to revoke a role.
    revokeRole: ((AccessControlEnumerable_Data, uint64, int, address) -> bool)?;
}

// --- Message handler ---

@inline
fun AccessControlEnumerable.onInternalMessage(mutate self, myBalance: int, msgValue: int, msgFull: cell, msgBody: slice) {
    var ac: AccessControl = {
        data: self.data.acData,
        hooks: null, // no hooks for now
    };
    return ac.onInternalMessage(myBalance, msgValue, msgFull, msgBody);
}

// --- Internal methods ---

// @dev Returns `true` if `account` has been granted `role`.
@inline
fun AccessControlEnumerable.hasRole(self, role: int, account: address): bool {
    return self.data.hasRole(role, account); // no hooks for now, proxy to default implementation
}

/// @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
///
/// Internal function without access restriction.
///
/// Emits a {RoleGranted} event if `role` was granted. 
fun AccessControlEnumerable.grantRole(mutate self, queryId: uint64, role: int, account: address): bool {
    // if (self.hooks != null && self.hooks.grantRole != null) {
    if (self.hooks != null) {
        return self.hooks.grantRole!(self.data, queryId, role, account); // extension hook
    }

    return self.data.grantRole(queryId, role, account); // default implementation
}

/// @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
///
/// Internal function without access restriction.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
fun AccessControlEnumerable.revokeRole(mutate self, queryId: uint64, role: int, account: address): bool {
    // if (self.hooks != null && self.hooks.revokeRole != null) {
    if (self.hooks != null) {
        return self.hooks.revokeRole!(self.data, queryId, role, account); // extension hook
    }

    return self.data.revokeRole(queryId, role, account); // default implementation
}

/// --- Underlying default implementation ---

// @dev Returns `true` if `account` has been granted `role`.
@inline
fun AccessControlEnumerable_Data.hasRole(self, role: int, account: address): bool {
    return self.acData.hasRole(role, account);
}

/// @dev Returns the number of accounts that have `role`. Can be used
/// together with {getRoleMember} to enumerate all bearers of a role.
fun AccessControlEnumerable_Data.getRoleMemberCount(self, role: int): int {
    // Check if the role is valid
    val (data, exists) = self.roleMembers.uDictGet(256, role);
    if (!exists) {
        // If the role does not exist, return 0
        return 0;
    }

    return AccessControlEnumerable_RoleData.fromSlice(data!).membersLen;
}

/// @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
/// Keeps track of the members of each role in `roleMembers`.
///
/// Internal function without access restriction.
///
/// Emits a {RoleGranted} event if `role` was granted. 
fun AccessControlEnumerable_Data.grantRole(mutate self, queryId: uint64, role: int, account: address): bool {
    val granted = self.acData.grantRole(queryId, role, account);
    if (granted) {
        // TODO: add account to roleMembers for role
    }
    return granted;
}

/// @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
/// Keeps track of the members of each role in `roleMembers`.
///
/// Internal function without access restriction.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
fun AccessControlEnumerable_Data.revokeRole(mutate self, queryId: uint64, role: int, account: address): bool {
    val revoked = self.acData.revokeRole(queryId, role, account);
    if (revoked) {
        // TODO: remove account from roleMembers for role
    }
    return revoked;
}

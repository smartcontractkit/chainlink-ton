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
    return self.data.hasRole(role, account); // no hooks for now, proxy to default implementation
}

/// @dev Returns the sender of the message.
///
/// Override available via {AccessControlEnumerable_Hooks<T>.msgSender} hook.
fun AccessControlEnumerable<T>.msgSender(mutate self, msgFull: cell): address {
    if (self.hooks != null && self.hooks.msgSender != null) {
        return self.hooks.msgSender!(self.context!, msgFull); // extension hook
    }

    return self.data.underlying.msgSender(msgFull); // default implementation
}

/// @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
///
/// Internal function without access restriction.
///
/// Emits a {RoleGranted} event if `role` was granted.
/// Override available via {AccessControlEnumerable_Hooks<T>.grantRole} hook.
fun AccessControlEnumerable<T>.grantRole(mutate self, queryId: uint64, role: int, account: address): bool {
    if (self.hooks != null && self.hooks.grantRole != null) {
        return self.hooks.grantRole!(self.context!, queryId, role, account); // extension hook
    }

    return self.data.grantRole(queryId, role, account); // default implementation
}

/// @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
///
/// Internal function without access restriction.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
/// Override available via {AccessControlEnumerable_Hooks<T>.revokeRole} hook.
fun AccessControlEnumerable<T>.revokeRole(mutate self, queryId: uint64, role: int, account: address): bool {
    if (self.hooks != null && self.hooks.revokeRole != null) {
        return self.hooks.revokeRole!(self.context!, queryId, role, account); // extension hook
    }

    return self.data.revokeRole(queryId, role, account); // default implementation
}

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
fun AccessControlEnumerable<T>.get_getRoleMember(self, role: int, index: uint32): bool {
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
    // Construct extension hooks
    // Notice: no closures in Tolk, so we use static functions
    val hooks: AccessControl_Hooks<AccessControlEnumerable<T>> = {
        msgSender: AccessControlEnumerable_hook_msgSender<T>,
        grantRole: AccessControlEnumerable_hook_grantRole<T>,
        revokeRole: AccessControlEnumerable_hook_revokeRole<T>,
    };

    // Construct trait instance (with AccessControl<T>)
    var ac: AccessControl<AccessControlEnumerable<T>> = {
        data: self.data.underlying,
        // Set up runtime extensions
        context: self, // context to be injected into hooks
        hooks: hooks,
    };
    return ac.onInternalMessage(myBalance, msgValue, msgFull, msgBody);
}

/// --- Underlying default implementation ---

/// @dev Returns `true` if `account` has been granted `role`.
@inline
fun AccessControlEnumerable_Data.hasRole(self, role: int, account: address): bool {
    return self.underlying.hasRole(role, account);
}

/// @dev Returns the number of accounts that have `role`. Can be used
/// together with {getRoleMember} to enumerate all bearers of a role.
@inline
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
@inline
fun AccessControlEnumerable_Data.grantRole(mutate self, queryId: uint64, role: int, account: address): bool {
    val granted = self.underlying.grantRole(queryId, role, account);
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
@inline
fun AccessControlEnumerable_Data.revokeRole(mutate self, queryId: uint64, role: int, account: address): bool {
    val revoked = self.underlying.revokeRole(queryId, role, account);
    if (revoked) {
        // TODO: remove account from roleMembers for role
    }
    return revoked;
}

// --- Extension hooks (implementation) ---

// Notice: these functions are injected into the AccessControl<T> parent trait.
// These are static and global because Tolk does not yet support closures, anonymous fn, or interfaces.

/// @dev Hook in an extension, or call super (default) implementation.
@inline
fun AccessControlEnumerable_hook_msgSender<T>(ctx: AccessControlEnumerable<T>, msgFull: cell): address {
    return ctx.msgSender(msgFull); // proxy to self via context hook
}

/// @dev Hook in an extension, or call super (default) implementation.
@inline
fun AccessControlEnumerable_hook_grantRole<T>(ctx: AccessControlEnumerable<T>, queryId: uint64, role: int, account: address): bool {
    return ctx.grantRole(queryId, role, account); // proxy to self via context hook
}

/// @dev Hook in an extension, or call super (default) implementation.
@inline
fun AccessControlEnumerable_hook_revokeRole<T>(ctx: AccessControlEnumerable<T>, queryId: uint64, role: int, account: address): bool {
    return ctx.revokeRole(queryId, role, account); // proxy to self via context hook
}

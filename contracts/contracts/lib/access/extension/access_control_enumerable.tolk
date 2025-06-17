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

/// @dev Returns the sender of the message.
///
/// Override available via {AccessControlEnumerable_Hooks<T>._msgSender} hook.
fun AccessControlEnumerable<T>._msgSender(mutate self, msgFull: cell): address {
    if (self.hooks != null && self.hooks._msgSender != null) {
        return self.hooks._msgSender!(self.context!, msgFull); // extension hook
    }

    var super: AccessControl<AccessControlEnumerable<T>>
        = self.hookTrait__AccessControl(); // hook into AccessControl<T> trait
    super.hooks!._msgSender = null; // disable self to avoid recursion

    return super._msgSender(msgFull); // default implementation
}

/// @dev Returns `true` if `account` has been granted `role`.
@inline
fun AccessControlEnumerable<T>.hasRole(self, role: int, account: address): bool {
    // Notice: client extension hook NOT available for hasRole

    var super: AccessControl<AccessControlEnumerable<T>>
        = self.hookTrait__AccessControl(); // hook into AccessControl<T> trait
    // super.hooks.hasRole = null; // disable self to avoid recursion

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
/// Override available via {AccessControlEnumerable_Hooks<T>.grantRole} hook.
fun AccessControlEnumerable<T>.grantRole(mutate self, queryId: uint64, role: int, account: address, msgFull: cell): bool {
    if (self.hooks != null && self.hooks.grantRole != null) {
        return self.hooks.grantRole!(self.context!, queryId, role, account, msgFull); // extension hook
    }

    var super: AccessControl<AccessControlEnumerable<T>>
        = self.hookTrait__AccessControl(); // hook into AccessControl<T> trait
    super.hooks!.grantRole = null; // disable self to avoid recursion

    return super.grantRole(queryId, role, account, msgFull); // default implementation
}

/// @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
/// Keeps track of the members of each role in `roleMembers`.
///
/// Internal function without access restriction.
///
/// Emits a {RoleGranted} event if `role` was granted.
/// Override available via {AccessControlEnumerable_Hooks<T>._grantRole} hook.
fun AccessControlEnumerable<T>._grantRole(mutate self, queryId: uint64, role: int, account: address): bool {
    if (self.hooks != null && self.hooks._grantRole != null) {
        return self.hooks._grantRole!(self.context!, queryId, role, account); // extension hook
    }

    var super: AccessControl<AccessControlEnumerable<T>>
        = self.hookTrait__AccessControl(); // hook into AccessControl<T> trait
    super.hooks!._grantRole = null; // disable self to avoid recursion

    val granted = super._grantRole(queryId, role, account); // default implementation
    if (granted) {
        // TODO: add account to roleMembers for role
    }
    return granted;
}

/// @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
/// Override available via {AccessControlEnumerable_Hooks<T>.revokeRole} hook.
fun AccessControlEnumerable<T>.revokeRole(mutate self, queryId: uint64, role: int, account: address, msgFull: cell): bool {
    if (self.hooks != null && self.hooks.revokeRole != null) {
        return self.hooks.revokeRole!(self.context!, queryId, role, account, msgFull); // extension hook
    }

    var super: AccessControl<AccessControlEnumerable<T>>
        = self.hookTrait__AccessControl(); // hook into AccessControl<T> trait
    super.hooks!.revokeRole = null; // disable self to avoid recursion

    return self.revokeRole(queryId, role, account, msgFull); // default implementation
}

/// @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
/// Keeps track of the members of each role in `roleMembers`.
///
/// Internal function without access restriction.
///
/// Emits a {RoleRevoked} event if `role` was revoked.
/// Override available via {AccessControlEnumerable_Hooks<T>.revokeRole} hook.
fun AccessControlEnumerable<T>._revokeRole(mutate self, queryId: uint64, role: int, account: address): bool {
    if (self.hooks != null && self.hooks._revokeRole != null) {
        return self.hooks._revokeRole!(self.context!, queryId, role, account); // extension hook
    }

    var super: AccessControl<AccessControlEnumerable<T>>
        = self.hookTrait__AccessControl(); // hook into AccessControl<T> trait
    super.hooks!._revokeRole = null; // disable self to avoid recursion

    val revoked = super._revokeRole(queryId, role, account);
    if (revoked) {
        // TODO: remove account from roleMembers for role
    }
    return revoked;
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
    var super: AccessControl<AccessControlEnumerable<T>>
        = self.hookTrait__AccessControl(); // hook into AccessControl<T> trait
    return super.onInternalMessage(myBalance, msgValue, msgFull, msgBody);
}

// --- Extension hooks ---

@inline
fun AccessControlEnumerable<T>.hookTrait__AccessControl(self): AccessControl<AccessControlEnumerable<T>>{
    // Notice: no closures in Tolk, so we use static functions
    val hooks: AccessControl_Hooks<AccessControlEnumerable<T>> = {
        _msgSender: AccessControlEnumerable_hook__msgSender<T>,
        grantRole: AccessControlEnumerable_hook_grantRole<T>,
        revokeRole: AccessControlEnumerable_hook_revokeRole<T>,
        _grantRole: AccessControlEnumerable_hook__grantRole<T>,
        _revokeRole: AccessControlEnumerable_hook__revokeRole<T>,
    };

    // Construct trait instance (with AccessControl<T>)
    return {
        data: self.data.underlying,
        // Set up runtime extensions
        context: self, // context to be injected into hooks
        hooks: hooks,
    };
}

// --- Extension hooks (closure proxy) ---

// Notice: these functions are injected into the AccessControl<T> parent trait.
// These are static and global because Tolk does not yet support closures, anonymous fn, or interfaces.

/// @dev Hook in an extension, or call super (default) implementation.
@inline
fun AccessControlEnumerable_hook__msgSender<T>(ctx: AccessControlEnumerable<T>, msgFull: cell): address {
    return ctx._msgSender(msgFull); // proxy to self via context hook
}

/// @dev Hook in an extension, or call super (default) implementation.
@inline
fun AccessControlEnumerable_hook_grantRole<T>(ctx: AccessControlEnumerable<T>, queryId: uint64, role: int, account: address, msgFull: cell): bool {
    return ctx.grantRole(queryId, role, account, msgFull); // proxy to self via context hook
}

/// @dev Hook in an extension, or call super (default) implementation.
@inline
fun AccessControlEnumerable_hook_revokeRole<T>(ctx: AccessControlEnumerable<T>, queryId: uint64, role: int, account: address, msgFull: cell): bool {
    return ctx.revokeRole(queryId, role, account, msgFull); // proxy to self via context hook
}

/// @dev Hook in an extension, or call super (default) implementation.
@inline
fun AccessControlEnumerable_hook__grantRole<T>(ctx: AccessControlEnumerable<T>, queryId: uint64, role: int, account: address): bool {
    return ctx._grantRole(queryId, role, account); // proxy to self via context hook
}

/// @dev Hook in an extension, or call super (default) implementation.
@inline
fun AccessControlEnumerable_hook__revokeRole<T>(ctx: AccessControlEnumerable<T>, queryId: uint64, role: int, account: address): bool {
    return ctx._revokeRole(queryId, role, account); // proxy to self via context hook
}

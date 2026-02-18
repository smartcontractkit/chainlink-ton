// SPDX-License-Identifier: MIT
tolk 1.2

import "../utils.tolk";

/**
 * @dev Contract module that allows children to implement role-based access
 * control mechanisms. This version is a port of OpenZeppelin {access/AccessControl.sol}
 * and {access/extensions/AccessControlEnumerable.sol}, merged to allow enumerating role
 * members as TVM dictionaries are iterable.
 *
 * Roles are referred to by their `uint256` identifier. These should be exposed
 * in the external API and be unique. The best way to achieve this is by
 * using `const` hash digests (256 bit):
 *
 * ```tolk
 * const DEFAULT_ADMIN_ROLE = 0x00;
 * ```
 *
 * Roles can be used to represent a set of permissions. To restrict access to a
 * function call, use {requireRole}:
 *
 * ```tolk
 * fun foo(rbac: AccessControl<T>, acc: address) {
 *     rbac.requireRole(MY_ROLE, acc));
 *     ...
 * }
 * ```
 *
 * Roles can be granted and revoked dynamically via the {AccessControl_GrantRole} and
 * {AccessControl_RevokeRole} messages. Each role has an associated admin role, and only
 * accounts that have a role's admin role can call {grantRole} and {revokeRole}.
 *
 * By default, the admin role for all roles is `DEFAULT_ADMIN_ROLE`, which means
 * that only accounts with this role will be able to grant or revoke other
 * roles. More complex role relationships can be created by using
 * {_setRoleAdmin}.
 *
 * WARNING: The `DEFAULT_ADMIN_ROLE` is also its own admin: it has permission to
 * grant and revoke this role. Extra precautions should be taken to secure
 * accounts that have been granted it.
 */

// --- Messages - incoming ---

/// @dev Grants `role` to `account`.
///
/// If `account` had not been already granted `role`, sends a {AccessControl_RoleGranted} message.
///
/// Requirements:
///
/// - the caller must have `role`'s admin role.
///
/// May send a {AccessControl_RoleGranted} message.
///
struct (0x95cd540f) AccessControl_GrantRole {
    /// Query ID of the change request.
    queryId: uint64;

    /// Role definition.
    role: uint256;
    /// New account to add.
    account: address;
}

/// @dev Revokes `role` from `account`.
///
/// If `account` had been granted `role`, sends a {AccessControl_RoleRevoked} message.
///
/// Requirements:
///
/// - the caller must have `role`'s admin role.
///
/// May send a {AccessControl_RoleRevoked} message.
///
struct (0x969b0db9) AccessControl_RevokeRole {
    /// Query ID of the change request.
    queryId: uint64;

    /// Role definition.
    role: uint256;
    /// Account to revoke.
    account: address;
}

/// @dev Revokes `role` from the calling account.
///
/// Roles are often managed via {AccessControl_GrantRole} and
/// {AccessControl_RevokeRole}: this function's purpose is to provide a
/// mechanism for accounts to lose their privileges if they are
/// compromised (such as when a trusted device is misplaced).
///
/// If `account` had been granted `role`, sends a {AccessControl_RoleRevoked} message.
///
/// Requirements:
///
/// - the caller must be `callerConfirmation`.
///
/// May send a {AccessControl_RoleRevoked} message.
///
struct (0x39452c46) AccessControl_RenounceRole {
    /// Query ID of the change request.
    queryId: uint64;

    /// Role definition.
    role: uint256;
    /// Account to revoke.
    callerConfirmation: address;
}

/// @dev Union of all incoming messages.
type AccessControl_InMessage =
    | AccessControl_GrantRole
    | AccessControl_RevokeRole
    | AccessControl_RenounceRole;

// --- Messages - outgoing ---

/// @dev Sent when `account` is granted `role`.
///
/// `sender` is the account that originated the contract call. This account bears the admin role (for the granted role).
/// Expected in cases where the role was granted using the internal {AccessControl-_grantRole}.
///
struct (0xcf3ca837) AccessControl_RoleGranted {
    /// Query ID of the change request.
    queryId: uint64;

    /// Role definition.
    role: uint256;
    /// New account added.
    account: address;
    /// Account that requested the change.
    sender: address;
}

/// @dev Sent when `account` is revoked `role`.
///
/// `sender` is the account that originated the contract call:
///  - if using `revokeRole`, it is the admin role bearer
/// - if using `renounceRole`, it is the role bearer (i.e. `account`)
///
struct (0x990fe1c7) AccessControl_RoleRevoked {
    /// Query ID of the change request.
    queryId: uint64;

    /// Role definition.
    role: uint256;
    /// Account revoked.
    account: address;
    /// Account that requested the change.
    sender: address;
}

/// @dev Sent when `newAdminRole` is set as ``role``'s admin role, replacing `previousAdminRole`
///
/// `DEFAULT_ADMIN_ROLE` is the starting admin for all roles, despite
/// {AccessControl_RoleAdminChanged} not being sent to signal this.
///
struct (0xbd7e8bce) AccessControl_RoleAdminChanged {
    /// Query ID of the change request.
    queryId: uint64;

    /// Role definition.
    role: uint256;
    /// Previous admin role of the specific role.
    previousAdminRole: uint256;
    /// New admin role of the specific role.
    newAdminRole: uint256;
}

// --- Storage ---

/// AccessControl contract struct, host storage and runtime hooks (extensions).
struct AccessControl<T> {
    data: AccessControl_Data;

    /// Runtime hooks (extensions)
    context: T?;
    hooks: AccessControl_Hooks<T>?;
}

/// AccessControl data struct, auto-serialized to/from cell.
struct AccessControl_Data {
    roles: map<uint256, Cell<AccessControl_RoleData>>;
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
    hasRole: map<address, bool>;
}

// --- Hooks struct (extensions) ---

/// @dev Hook extensions exposed by the AccessControl contract.
struct AccessControl_Hooks<T> {
    /// Hook to get the sender of the message.
    msgSender: ((T?, address, slice) -> address)?;

    /// Hook before granting a role.
    shouldGrantRole: ((T?, uint64, uint256, address) -> void)?;

    /// Hook before revoking a role.
    shouldRevokeRole: ((T?, uint64, uint256, address) -> void)?;
}

// --- Constants ---

const DEFAULT_ADMIN_ROLE = 0x00;

/// Error codes used by the Timelock contract.
enum AccessControl_Error {
    UnauthorizedAccount = 47400 // AccessControl<T>.errorCode(0)
    BadConfirmation
}

// --- Methods ---

/// Returns the error code for this facility and the given local code.
///     errorCode(0) == 60900
fun AccessControl<T>.errorCode(local: uint16): uint16 {
    return getErrorCode(stringCrc32("link.chain.ton.lib.access.AccessControl"), local);
}

/// @dev Returns the sender of the message.
///
/// Override available via {AccessControl_Hooks<T>.msgSender} hook.
fun AccessControl<T>.msgSender(self, msgSender: address, msgBody: slice): address {
    if (self.hooks != null && self.hooks.msgSender != null) {
        return self.hooks.msgSender(self.context, msgSender, msgBody); // extension hook
    }

    // Default implementation: return the address from the message sender
    return msgSender;
}

/// @dev Modifier that checks that an account has a specific role. Reverts
/// with a standardized message including the required role.
///
/// Format of the revert message is described in {requireRole}.
@inline
fun AccessControl<T>.onlyRole(self, role: uint256, msgSender: address, msgBody: slice): void {
    self.requireRoleSender(role, msgSender, msgBody);
}

// @dev Returns `true` if `account` has been granted `role`.
fun AccessControl<T>.hasRole(self, role: uint256, account: address): bool {
    // Check if the role is valid
    val data = self.data.roles.get(role);
    if (!data.isFound) {
        return false;
    }

    // Check if the account exists in the role data
    val d = lazy AccessControl_RoleData.fromCell(data.loadValue());
    val acc = d.hasRole.get(account);
    return acc.isFound;
}

/// @dev Revert with a standard message if `msgSender()` is missing `role`.
///
/// Format of the revert message is described in {requireRole}.
fun AccessControl<T>.requireRoleSender(self, role: int, msgSender: address, msgBody: slice): void {
    val sender = self.msgSender(msgSender, msgBody);
    self.requireRole(role, sender);
}

/// @dev Revert with a standard message if `account` is missing `role`.
///
/// The format of the revert reason is given by the following regular expression:
///
/// /^AccessControl: account (0x[0-9a-f]{40}) is missing role (0x[0-9a-f]{64})$/
///
fun AccessControl<T>.requireRole(self, role: uint256, account: address): void {
    if (!self.hasRole(role, account)) {
        val arg = beginCell()
            .storeAddress(account)
            .storeUint(role, 256)
            .endCell()
            .beginParse();
        throw (AccessControl_Error.UnauthorizedAccount, arg);
    }
}

/// @dev Returns the admin role that controls `role`. See {grantRole} and {revokeRole}.
///
/// To change a role's admin, use {setRoleAdmin}.
fun AccessControl<T>.getRoleAdmin(self, role: uint256): uint256 {
    val data = self.data.roles.get(role);
    if (!data.isFound) {
        return DEFAULT_ADMIN_ROLE;
    }

    val d = lazy AccessControl_RoleData.fromCell(data.loadValue());
    return d.adminRole;
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
fun AccessControl<T>.getRoleMember(self, role: uint256, index: uint32): address? {
    // Check if the role is valid
    val data = self.data.roles.get(role);
    if (!data.isFound) {
        return null; // role does not exist
    }

    // Check if the account exists in the role data
    var d = lazy AccessControl_RoleData.fromCell(data.loadValue());
    if (index >= d.membersLen) {
        return null; // index out of bounds
    }

    // Notice: we need to iterate through the map to get the account at the specified index.
    // This is not efficient, but it is a way to get an account at index without additional data structures.
    var i = 0;
    var rd = d.hasRole.findFirst(); // assumes <index> members exist
    while (i < index && rd.isFound) {
        rd = d.hasRole.iterateNext(rd);
        i += 1; // increment to next account
    }

    // Get the account at the specified index
    return rd.isFound ? rd.getKey() : null;
}

/// @dev Returns the number of accounts that have `role`. Can be used
/// together with {getRoleMember} to enumerate all bearers of a role.
@inline
fun AccessControl<T>.getRoleMemberCount(self, role: uint256): int {
    // Check if the role is valid
    val data = self.data.roles.get(role);
    if (!data.isFound) {
        return 0; // role does not exist
    }

    val d = lazy AccessControl_RoleData.fromCell(data.loadValue());
    return d.membersLen;
}

@inline
fun AccessControl<T>.getRoleMemberFirst(self, role: uint256): address? {
    // Check if the role is valid
    val data = self.data.roles.get(role);
    if (!data.isFound) {
        return null; // role does not exist
    }

    val d = lazy AccessControl_RoleData.fromCell(data.loadValue());
    if (d.membersLen == 0) {
        return null; // no members in the role
    }

    // Get the first account in the role data
    var acc = d.hasRole.findFirst();
    return acc.getKey();
}

@inline
fun AccessControl<T>.getRoleMemberNext(self, role: uint256, pivot: address): address? {
    // Check if the role is valid
    val data = self.data.roles.get(role);
    if (!data.isFound) {
        return null; // role does not exist
    }

    // Get the next account in the role data after the pivot
    val d = lazy AccessControl_RoleData.fromCell(data.loadValue());
    var acc = d.hasRole.findKeyGreater(pivot);
    if (!acc.isFound) {
        return null; // no next account
    }

    return acc.getKey();
}

/// @dev Return all accounts that have `role`.
@inline
fun AccessControl<T>.getRoleMembers(self, role: uint256): map<address, bool> {
    // Check if the role is valid
    val data = self.data.roles.get(role);
    if (!data.isFound) {
        return createEmptyMap(); // role does not exist
    }

    val d = lazy AccessControl_RoleData.fromCell(data.loadValue());
    return d.hasRole;
}

// --- Methods - mutations ---

/// @dev Grants `role` to `account`.
///
/// Requirements:
/// - the `sender` must have `role`'s admin role.
///
/// Sends a {AccessControl_RoleGranted} event (to: sender, account) if `role` was granted.
fun AccessControl<T>.grantRole(
    mutate self,
    queryId: uint64,
    sender: address,
    role: uint256,
    account: address,
    returnExcess: bool = false
): bool {
    self.requireRole(self.getRoleAdmin(role), sender);
    return self._grantRole(queryId, sender, role, account, returnExcess);
}

/// @dev Revokes `role` from `account`.
///
/// Requirements:
/// - the `sender` must have `role`'s admin role.
///
/// Sends a {AccessControl_RoleRevoked} event (to: sender, account) if `role` was revoked.
fun AccessControl<T>.revokeRole(
    mutate self,
    queryId: uint64,
    sender: address,
    role: uint256,
    account: address,
    returnExcess: bool = false
): bool {
    self.requireRole(self.getRoleAdmin(role), sender);
    return self._revokeRole(queryId, sender, role, account, returnExcess);
}

/// @dev Revokes `role` from the calling account.
///
/// Roles are often managed via {grantRole} and {revokeRole}: this function's
/// purpose is to provide a mechanism for accounts to lose their privileges
/// if they are compromised (such as when a trusted device is misplaced).
///
/// If the calling account had been revoked `role`, sends a {AccessControl_RoleRevoked} message.
///
/// Requirements:
///
/// - the `sender` must be `callerConfirmation`.
///
/// Sends a {AccessControl_RoleRevoked} event (to: sender, account) if `role` was revoked.
fun AccessControl<T>.renounceRole(
    mutate self,
    queryId: uint64,
    sender: address,
    role: uint256,
    callerConfirmation: address,
    returnExcess: bool = false
): bool {
    if (callerConfirmation != sender) {
        throw AccessControl_Error.BadConfirmation;
    }

    // Renouncing a role is equivalent to revoking it from the caller
    return self._revokeRole(queryId, sender, role, callerConfirmation, returnExcess);
}

/// @dev Sets `adminRole` as `role`'s admin role.
///
/// Internal function without access restriction.
///
/// Sends a {AccessControl_RoleAdminChanged} reply to sender.
fun AccessControl<T>._setRoleAdmin(
    mutate self,
    queryId: uint64,
    sender: address,
    role: uint256,
    adminRole: uint256,
    returnExcess: bool = false
): void {
    var d: AccessControl_RoleData = self.data.getRoleDataOrSetDefault(role);
    val previousAdminRole = d.adminRole;
    // Update the admin role for the role
    d.adminRole = adminRole;

    // Save the updated role data
    self.data.roles.set(role, d.toCell());

    val body = AccessControl_RoleAdminChanged{queryId, role, previousAdminRole, newAdminRole: adminRole};
    self.sendReply(sender, body, calculateGasFeeFor(FEE_SIZE_SMALL), returnExcess);
}

/// @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
///
/// Internal function without access restriction.
/// Sends a {AccessControl_RoleGranted} event (to: sender, account) if `role` was granted.
fun AccessControl<T>._grantRole(
    mutate self,
    queryId: uint64,
    sender: address,
    role: uint256,
    account: address,
    returnExcess: bool = false
): bool {
    if (self.hooks != null && self.hooks.shouldGrantRole != null) {
        self.hooks.shouldGrantRole(self.context, queryId, role, account); // extension hook
    }

    // Default implementation of granting a role
    var d: AccessControl_RoleData = self.data.getRoleDataOrSetDefault(role);

    // Check if the account exists in the role data
    val hasRole = d.hasRole.get(account);
    if (hasRole.isFound) {
        return false; // nothing to do
    }

    // Add the account to the role
    d.hasRole.set(account, true);
    d.membersLen += 1; // increment the number of members in the role

    // Save the updated role data
    self.data.roles.set(role, d.toCell());

    val minFee = calculateGasFeeFor(FEE_SIZE_SMALL);
    val body = AccessControl_RoleGranted{queryId, role, account, sender};
    self.sendNotification(sender, body, minFee, account);
    self.sendReply(sender, body, minFee, returnExcess);

    return true; // role granted successfully
}

/// @dev Attempts to revoke `role` from `account` and returns a boolean indicating if `role` was revoked.
///
/// Internal function without access restriction.
/// Sends a {AccessControl_RoleRevoked} event (to: sender, account) if `role` was revoked.
fun AccessControl<T>._revokeRole(
    mutate self,
    queryId: uint64,
    sender: address,
    role: uint256,
    account: address,
    returnExcess: bool = false
): bool {
    if (self.hooks != null && self.hooks.shouldRevokeRole != null) {
        self.hooks.shouldRevokeRole(self.context, queryId, role, account); // extension hook
    }

    // Default implementation of revoking a role
    var d: AccessControl_RoleData = self.data.getRoleDataOrSetDefault(role);

    // Check if the account exists in the role data
    val hasRole = d.hasRole.get(account);
    if (!hasRole.isFound) {
        return false; // nothing to do
    }

    // Remove the account from the role
    d.hasRole.delete(account);
    d.membersLen -= 1; // decrement the number of members in the role

    // Save the updated role data
    self.data.roles.set(role, d.toCell());

    val minFee = calculateGasFeeFor(FEE_SIZE_SMALL);
    val body = AccessControl_RoleRevoked{queryId, role, account, sender};
    self.sendNotification(sender, body, minFee, account);
    self.sendReply(sender, body, minFee, returnExcess);

    return true; // role revoked successfully
}

/// --- Helpers ---

@inline
fun AccessControl_Data.getRoleDataOrSetDefault(mutate self, role: uint256): AccessControl_RoleData {
    // Check if the role is valid
    val data = self.roles.get(role);
    if (data.isFound) {
        return AccessControl_RoleData.fromCell(data.loadValue());
    }

    // Create a new role data if it doesn't exist
    var _data: AccessControl_RoleData = {
        adminRole: DEFAULT_ADMIN_ROLE,
        // Initialize hasRole as an empty map
        hasRole: createEmptyMap(),
        membersLen: 0,
    };
    self.roles.set(role, _data.toCell());
    return _data;
}

/// @dev Sends a (notification) message to the the updated account.
@inline
fun AccessControl<T>.sendNotification<B>(
    self,
    sender: address,
    body: B,
    value: coins,
    account: address,
): void {
    // Skip notification if account == sender
    if (account != sender) {
        // Create and send the message (notification) to the account that was updated
        val n = createMessage({ bounce: false, value, dest: account, body });
        n.send(SEND_MODE_PAY_FEES_SEPARATELY);
    }
}

/// @dev Sends a (reply) message to the sender.
@inline
fun AccessControl<T>.sendReply<B>(
    self,
    sender: address,
    body: B,
    value: coins,
    returnExcess: bool = true
): void {
    // Create and send the message (reply) to the sender
    value = returnExcess ? ton("0") : value; // return all, or fixed compute budget

    val reply = createMessage({bounce: false, value, dest: sender, body });
    reply.send(returnExcess
        ? SEND_MODE_REGULAR | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE
        : SEND_MODE_PAY_FEES_SEPARATELY);
}

// --- Getters ---

/// @dev getter to export by the contract
@inline
fun AccessControl<T>.get_hasRole(self, role: uint256, account: address): bool {
   return self.hasRole(role, account)
}

/// @dev getter to export by the contract
@inline
fun AccessControl<T>.get_getRoleAdmin(self, role: uint256): uint256 {
   return self.getRoleAdmin(role)
}

// --- Getters - <AccessControl<T>> enumerable extension ---

/// @dev getter to export downstream
@inline
fun AccessControl<T>.get_getRoleMember(self, role: uint256, index: uint32): address {
   return self.getRoleMember(role, index)
}

/// @dev getter to export downstream
@inline
fun AccessControl<T>.get_getRoleMemberCount(self, role: uint256): int {
   return self.getRoleMemberCount(role)
}

// @dev getter to export downstream
@inline
fun AccessControl<T>.get_getRoleMemberFirst(self, role: uint256): address {
   return self.getRoleMemberFirst(role)
}

/// @dev getter to export downstream
@inline
fun AccessControl<T>.get_getRoleMemberNext(self, role: uint256, pivot: address): address {
   return self.getRoleMemberNext(role, pivot)
}

/// @dev getter to export downstream
@inline
fun AccessControl<T>.get_getRoleMembers(self, role: uint256): map<address, bool>  {
   return self.getRoleMembers(role)
}

// --- Message handlers ---

@inline
fun AccessControl<T>.onInternalMessage(mutate self, msgSender: address, _msgValue: coins, msgBody: slice) {
    // We return excess to sender by default via message handling,
    // but users can change this behavior by setting `returnExcess`
    // to false using AccessControl methods directly.
    val returnExcess = true;
    val sender = self.msgSender(msgSender, msgBody);
    val msg = lazy AccessControl_InMessage.fromSlice(msgBody);
    match (msg) {
        AccessControl_GrantRole => {
            self.grantRole(msg.queryId, sender, msg.role, msg.account, returnExcess);
        },
        AccessControl_RevokeRole => {
            self.revokeRole(msg.queryId, sender, msg.role, msg.account, returnExcess);
        },
        AccessControl_RenounceRole => {
            self.renounceRole(msg.queryId, sender, msg.role, msg.callerConfirmation, returnExcess);
        },
        else => {
            return 0; // unknown message, not handled
        }
    };

    return -1; // handled
}

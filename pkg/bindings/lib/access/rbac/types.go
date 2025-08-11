package rbac

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

// --- Messages - incoming ---

// @dev Grants `role` to `account`.
//
// If `account` had not been already granted `role`, emits a {AccessControl_RoleGranted} event.
//
// Requirements:
//
// - the caller must have `role`'s admin role.
//
// May emit a {AccessControl_RoleGranted} event.
type GrantRole struct {
	_ tlb.Magic `tlb:"#95cd540f"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Role    *big.Int         `tlb:"## 256"` // Role definition.
	Account *address.Address `tlb:"addr"`   // New account to add.
}

// @dev Revokes `role` from `account`.
//
// If `account` had been granted `role`, emits a {AccessControl_RoleRevoked} event.
//
// Requirements:
//
// - the caller must have `role`'s admin role.
//
// May emit a {AccessControl_RoleRevoked} event.
type RevokeRole struct {
	_ tlb.Magic `tlb:"#969b0db9"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Role    *big.Int         `tlb:"## 256"` // Role definition.
	Account *address.Address `tlb:"addr"`   // Account to revoke.
}

// @dev Revokes `role` from the calling account.
//
// Roles are often managed via {AccessControl_GrantRole} and
// {AccessControl_RevokeRole}: this function's purpose is to provide a
// mechanism for accounts to lose their privileges if they are
// compromised (such as when a trusted device is misplaced).
//
// If `account` had been granted `role`, emits a {AccessControl_RoleRevoked} event.
//
// Requirements:
//
// - the caller must be `callerConfirmation`.
//
// May emit a {AccessControl_RoleRevoked} event.
type RenounceRole struct {
	_ tlb.Magic `tlb:"#39452c46"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Role               *big.Int         `tlb:"## 256"` // Role definition.
	CallerConfirmation *address.Address `tlb:"addr"`   // Account to revoke.
}

// --- Messages - outgoing ---

// @dev Emitted when `account` is granted `role`.
//
// `sender` is the account that originated the contract call. This account bears the admin role (for the granted role).
// Expected in cases where the role was granted using the internal {AccessControl-_grantRole}.
type RoleGranted struct {
	_ tlb.Magic `tlb:"#cf3ca837"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Role    *big.Int         `tlb:"## 256"` // Role definition.
	Account *address.Address `tlb:"addr"`   // New account added.
	Sender  *address.Address `tlb:"addr"`   // Account that requested the change.
}

// @dev Emitted when `account` is revoked `role`.
//
// `sender` is the account that originated the contract call:
//   - if using `revokeRole`, it is the admin role bearer
//
// - if using `renounceRole`, it is the role bearer (i.e. `account`)
type RoleRevoked struct {
	_ tlb.Magic `tlb:"#990fe1c7"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Role    *big.Int         `tlb:"## 256"` // Role definition.
	Account *address.Address `tlb:"addr"`   // Account revoked.
	Sender  *address.Address `tlb:"addr"`   // Account that requested the change.
}

// @dev Emitted when `newAdminRole` is set as “role“'s admin role, replacing `previousAdminRole`
//
// `DEFAULT_ADMIN_ROLE` is the starting admin for all roles, despite
// {AccessControl_RoleAdminChanged} not being emitted to signal this.
type RoleAdminChanged struct {
	_ tlb.Magic `tlb:"#bd7e8bce"` //nolint:revive // (opcode) should stay uninitialized

	// Query ID of the change owner request.
	QueryID uint64 `tlb:"## 64"`

	Role              *big.Int `tlb:"## 256"` // Role definition.
	PreviousAdminRole *big.Int `tlb:"## 256"` // Previous admin role of the specific role.
	NewAdminRole      *big.Int `tlb:"## 256"` // New admin role of the specific role.
}

// AccessControl data struct, auto-serialized to/from cell.
type Data struct {
	// Roles mapping
	Roles map[uint32]RoleData `tlb:"dict"`
}

// Internal storage struct for role data
//
// Each role has a mapping of accounts that have been granted that role,
// and an admin role that can manage that role.
type RoleData struct {
	AdminRole *big.Int `tlb:"## 256"`
	// Number of members in the role
	MembersLen uint64 `tlb:"## 64"`
	// Members of the role, indexed by their address hash.
	HasRole map[*address.Address]bool `tlb:"dict"` // map<address, slice>
}

// --- Constants ---

const (
	DefaultAdminRole = 0x00

	ErrorAccessControlUnauthorizedAccount = 90
	ErrorAccessControlBadConfirmation     = 91
)

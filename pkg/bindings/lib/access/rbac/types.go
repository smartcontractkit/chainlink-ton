package rbac

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
)

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

package rmnremote

import (
	"math/big"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
)

// GlobalCurseSubject is cursed to curse every subject at once.
var GlobalCurseSubject, _ = new(big.Int).SetString("01000000000000000000000000000001", 16)

var (
	// CurseRole is keccak256('CURSE_ROLE'); bearers may curse subjects.
	CurseRole, _ = new(big.Int).SetString("b3c5b7cb9096e539f419cdc795a52c8cbe8dfbc9e27f70077d0b9749efe27fc5", 16)
	// UncurseRole is keccak256('UNCURSE_ROLE'); bearers may uncurse subjects.
	UncurseRole, _ = new(big.Int).SetString("19331e9591f40b6bd5c2716faeab95f6a63184877fab2619bf484155c597abf0", 16)
)

// EmptyAccessControlData mirrors `CursePolicy.empty()` on-chain: no explicit
// role members. The policy admin is an implicit bearer of DEFAULT_ADMIN_ROLE,
// CurseRole and UncurseRole.
func EmptyAccessControlData() rbac.Data {
	return rbac.Data{Roles: tlbe.NewEmptyDict[tlbe.Uint256, rbac.RoleRef]()}
}

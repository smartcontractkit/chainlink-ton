// Package rmnremote mirrors contracts/contracts/ccip/rmn_remote/lib.tolk: the
// role-backed curse policy that both the Router and every TokenPool compose
// into their own storage.
package rmnremote

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
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

// NewAccessControlData builds the initial role set of a CursePolicy, matching
// `CursePolicy.init` on-chain: `admin` holds DEFAULT_ADMIN_ROLE and therefore
// administers both curse roles, while `curser` and `uncurser` hold CurseRole
// and UncurseRole respectively.
func NewAccessControlData(admin, curser, uncurser *address.Address) (rbac.Data, error) {
	roles := tlbe.NewEmptyDict[tlbe.Uint256, rbac.RoleRef]()
	for _, assignment := range []struct {
		role   *big.Int
		member *address.Address
	}{
		{big.NewInt(rbac.DefaultAdminRole), admin},
		{CurseRole, curser},
		{UncurseRole, uncurser},
	} {
		if assignment.member == nil {
			return rbac.Data{}, fmt.Errorf("no member given for role %x", assignment.role)
		}
		members := tlbe.NewEmptyDict[common.AddressWrap, bool]()
		members.Set(common.AddressWrap{Val: assignment.member}, true)
		roles.Set(*tlbe.NewUint256(assignment.role), rbac.RoleRef{Role: rbac.RoleData{
			AdminRole:  tlbe.NewUint256(big.NewInt(rbac.DefaultAdminRole)),
			MembersLen: 1,
			HasRole:    members,
		}})
	}
	return rbac.Data{Roles: roles}, nil
}

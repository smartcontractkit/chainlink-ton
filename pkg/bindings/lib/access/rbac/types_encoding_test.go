package rbac_test

import (
	"encoding/hex"
	"math/big"
	"testing"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
)

const (
	emptyRolesHash = "90aec8965afabb16ebc3cb9b408ebae71b618d78788bc80d09843593cac98da4"
	threeRolesHash = "fd5992b82a2d646dee14e7e0fd9cce1d15a4322caa02a8c03185b16a32d44f9b"
)

const (
	curseRole   = "b3c5b7cb9096e539f419cdc795a52c8cbe8dfbc9e27f70077d0b9749efe27fc5"
	uncurseRole = "19331e9591f40b6bd5c2716faeab95f6a63184877fab2619bf484155c597abf0"
)

func role(t *testing.T, hexRole string) tlbe.Uint256 {
	t.Helper()
	v, ok := new(big.Int).SetString(hexRole, 16)
	if !ok {
		t.Fatalf("bad role %q", hexRole)
	}
	return *tlbe.NewUint256(v)
}

func TestDataEmptyMatchesContract(t *testing.T) {
	c, err := tlb.ToCell(rbac.Data{Roles: tlbe.NewEmptyDict[tlbe.Uint256, rbac.RoleRef]()})
	if err != nil {
		t.Fatal(err)
	}
	if got := hex.EncodeToString(c.Hash()); got != emptyRolesHash {
		t.Errorf("empty roles hash = %s, want %s", got, emptyRolesHash)
	}
}

func TestDataMatchesContractAndRoundTrips(t *testing.T) {
	admin := address.NewAddress(0, 0, make([]byte, 32))

	roleRef := func() rbac.RoleRef {
		members := tlbe.NewEmptyDict[common.AddressWrap, bool]()
		members.Set(common.AddressWrap{Val: admin}, true)
		return rbac.RoleRef{Role: rbac.RoleData{
			AdminRole:  tlbe.NewUint256(big.NewInt(rbac.DefaultAdminRole)),
			MembersLen: 1,
			HasRole:    members,
		}}
	}

	roles := tlbe.NewEmptyDict[tlbe.Uint256, rbac.RoleRef]()
	roles.Set(role(t, "0"), roleRef())
	roles.Set(role(t, curseRole), roleRef())
	roles.Set(role(t, uncurseRole), roleRef())

	encoded, err := tlb.ToCell(rbac.Data{Roles: roles})
	if err != nil {
		t.Fatal(err)
	}
	if got := hex.EncodeToString(encoded.Hash()); got != threeRolesHash {
		t.Fatalf("three roles hash = %s, want %s", got, threeRolesHash)
	}

	var decoded rbac.Data
	slice, err := encoded.BeginParse()
	if err != nil {
		t.Fatalf("begin parse: %v", err)
	}
	if err := tlb.LoadFromCell(&decoded, slice); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got := decoded.Roles.Len(); got != 3 {
		t.Fatalf("decoded %d roles, want 3", got)
	}
	curse, ok := decoded.Roles.Get(role(t, curseRole))
	if !ok {
		t.Fatal("CURSE_ROLE missing after round trip")
	}
	if curse.Role.MembersLen != 1 {
		t.Errorf("CURSE_ROLE MembersLen = %d, want 1", curse.Role.MembersLen)
	}
	// AddressWrap holds a pointer, so map lookup compares identity rather than
	// the address value; scan the decoded members instead.
	found := false
	for member, held := range curse.Role.HasRole.AsMap() {
		if held && member.Val.String() == admin.String() {
			found = true
		}
	}
	if !found {
		t.Error("CURSE_ROLE member lost after round trip")
	}
}

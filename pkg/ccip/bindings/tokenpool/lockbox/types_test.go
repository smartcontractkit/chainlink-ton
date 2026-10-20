package lockbox

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
)

// TestStorage_InitializerRequired verifies the initializer is a required address:
// a nil (unbound) value must fail to encode, matching the non-optional Tolk field.
func TestStorage_InitializerRequired(t *testing.T) {
	minter := address.NewAddress(0, 0, make([]byte, 32))
	emptyRBAC := rbac.Data{Roles: tlbe.NewEmptyDict[tlbe.Uint256, rbac.RoleRef]()}

	valid := Storage{
		Initializer:   address.NewAddress(0, 0, make([]byte, 32)),
		MinterAddress: minter,
		RBAC:          emptyRBAC,
	}
	c, err := tlb.ToCell(valid)
	require.NoError(t, err)

	var decoded Storage
	require.NoError(t, tlb.LoadFromCell(&decoded, c.MustBeginParse()))
	require.NotNil(t, decoded.Initializer)

	_, err = tlb.ToCell(Storage{MinterAddress: minter, RBAC: emptyRBAC})
	require.ErrorContains(t, err, "address is required")
}

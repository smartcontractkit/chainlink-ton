package lockbox

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// --- Getters from JettonLockBox.tolk ---

// GetToken gets the jetton minter address (token) held by this lockbox.
//
// On-chain: get fun token(): address
var GetToken = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*address.Address]{
	Name: "token",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - token: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
})

// GetWallet gets the jetton wallet address used by this lockbox.
//
// On-chain: get fun wallet(): address?
var GetWallet = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*address.Address]{
	Name: "wallet",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		isNil, err := r.IsNil(0)
		if err != nil {
			return nil, fmt.Errorf("error checking IsNil(0) - wallet: %w", err)
		}
		if isNil {
			return nil, nil
		}
		addrSlice, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Slice(0) - wallet: %w", err)
		}
		return addrSlice.LoadAddr()
	}),
})

// GetTypeAndVersion gets the contract type and version.
//
// On-chain: get fun typeAndVersion(): (slice, slice)
var GetTypeAndVersion = common.GetTypeAndVersion

// GetIsSupportedToken checks if the given token is supported by this lockbox.
//
// On-chain: get fun isSupportedToken(token: address): bool
var GetIsSupportedToken = tvm.Getter[*address.Address, bool]{
	Name: "isSupportedToken",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
		v, err := r.Int(0)
		if err != nil {
			return false, fmt.Errorf("error getting Int(0) - isSupportedToken: %w", err)
		}
		return v.Cmp(big.NewInt(0)) != 0, nil
	}),
}

// --- Re-export RBAC getters (AccessControl trait) ---
// The JettonLockBox composes the AccessControl trait, which provides RBAC getters.

// GetHasRole checks whether an account has a specific role.
var GetHasRole = rbac.GetHasRole

// GetRoleAdmin gets the admin role for a given role.
var GetRoleAdmin = rbac.GetRoleAdmin

// GetRoleMemberCount gets the number of members with a specific role.
var GetRoleMemberCount = rbac.GetRoleMemberCount

// GetRoleMember gets the member at a given index for a specific role.
var GetRoleMember = rbac.GetRoleMember

// GetRoleMemberFirst gets the first member of a specific role.
var GetRoleMemberFirst = rbac.GetRoleMemberFirst

// GetRoleMemberNext gets the next member after a pivot for a specific role.
var GetRoleMemberNext = rbac.GetRoleMemberNext

// GetRoleMembers gets all members of a specific role as a map.
var GetRoleMembers = rbac.GetRoleMembers

// --- Argument types (re-exported for convenience) ---

// HasRoleArgs holds the arguments for the hasRole getter.
type HasRoleArgs = rbac.HasRoleArgs

// GetRoleMemberArgs holds the arguments for the getRoleMember getter.
type GetRoleMemberArgs = rbac.GetRoleMemberArgs

// GetRoleMemberNextArgs holds the arguments for the getRoleMemberNext getter.
type GetRoleMemberNextArgs = rbac.GetRoleMemberNextArgs

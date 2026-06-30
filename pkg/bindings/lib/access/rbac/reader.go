package rbac

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// GetHasRole checks whether an account has a specific role.
//
// On-chain: get fun hasRole(role: uint256, account: address): bool
var GetHasRole = tvm.Getter[HasRoleArgs, bool]{
	Name: "hasRole",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
		v, err := r.Int(0)
		if err != nil {
			return false, fmt.Errorf("error decoding hasRole result: %w", err)
		}
		return v.Cmp(big.NewInt(0)) != 0, nil
	}),
}

// HasRoleArgs holds the arguments for the hasRole getter.
type HasRoleArgs struct {
	Role    *big.Int
	Account *address.Address
}

// GetRoleAdmin gets the admin role for a given role.
//
// On-chain: get fun getRoleAdmin(role: uint256): uint256
var GetRoleAdmin = tvm.Getter[*big.Int, *big.Int]{
	Name: "getRoleAdmin",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*big.Int, error) {
		v, err := r.Int(0)
		if err != nil {
			return nil, fmt.Errorf("error decoding getRoleAdmin result: %w", err)
		}
		return v, nil
	}),
}

// GetRoleMemberCount gets the number of members with a specific role.
//
// On-chain: get fun getRoleMemberCount(role: uint256): int
var GetRoleMemberCount = tvm.Getter[*big.Int, uint64]{
	Name: "getRoleMemberCount",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (uint64, error) {
		rs, err := r.Int(0)
		if err != nil {
			return 0, fmt.Errorf("error decoding getRoleMemberCount result: %w", err)
		}

		return rs.Uint64(), nil
	}),
}

type GetRoleMemberArgs struct {
	Role  *big.Int
	Index uint64
}

// GetRoleMember gets the member at a given index for a specific role.
//
// On-chain: get fun getRoleMember(role: uint256, index: uint32): address?
var GetRoleMember = tvm.Getter[GetRoleMemberArgs, *address.Address]{
	Name: "getRoleMember",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		isNil, err := r.IsNil(0)
		if err != nil {
			return nil, fmt.Errorf("error checking IsNil(0) - getRoleMember: %w", err)
		}
		if isNil {
			return nil, nil
		}
		sAddr, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error decoding getRoleMember result: %w", err)
		}

		addr, err := sAddr.LoadAddr()
		if err != nil {
			return nil, fmt.Errorf("error decoding getRoleMember result slice: %w", err)
		}
		return addr, nil
	}),
}

// GetRoleMemberFirst gets the first member of a specific role.
//
// On-chain: get fun getRoleMemberFirst(role: uint256): address?
var GetRoleMemberFirst = tvm.Getter[*big.Int, *address.Address]{
	Name: "getRoleMemberFirst",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		isNil, err := r.IsNil(0)
		if err != nil {
			return nil, fmt.Errorf("error checking IsNil(0) - getRoleMemberFirst: %w", err)
		}
		if isNil {
			return nil, nil
		}
		sAddr, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error decoding getRoleMemberFirst result: %w", err)
		}

		addr, err := sAddr.LoadAddr()
		if err != nil {
			return nil, fmt.Errorf("error decoding getRoleMemberFirst result slice: %w", err)
		}
		return addr, nil
	}),
}

// GetRoleMemberNextArgs holds the arguments for the getRoleMemberNext getter.
type GetRoleMemberNextArgs struct {
	Role  *big.Int
	Pivot *address.Address
}

// GetRoleMemberNext gets the next member after a pivot for a specific role.
//
// On-chain: get fun getRoleMemberNext(role: uint256, pivot: address): address?
var GetRoleMemberNext = tvm.Getter[GetRoleMemberNextArgs, *address.Address]{
	Name: "getRoleMemberNext",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		isNil, err := r.IsNil(0)
		if err != nil {
			return nil, fmt.Errorf("error checking IsNil(0) - getRoleMemberNext: %w", err)
		}
		if isNil {
			return nil, nil
		}
		sAddr, err := r.Slice(0)
		if err != nil {
			return nil, fmt.Errorf("error decoding getRoleMemberNext result: %w", err)
		}

		addr, err := sAddr.LoadAddr()
		if err != nil {
			return nil, fmt.Errorf("error decoding getRoleMemberNext result slice: %w", err)
		}
		return addr, nil
	}),
}

// GetRoleMembers gets all members of a specific role as a map.
//
// On-chain: get fun getRoleMembers(role: uint256): map<address, bool>
var GetRoleMembers = tvm.Getter[*big.Int, map[*address.Address]bool]{
	Name: "getRoleMembers",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (map[*address.Address]bool, error) {
		c, err := r.Cell(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Cell(0) - getRoleMembers: %w", err)
		}

		cs := c.BeginParse()
		dict, err := cs.LoadDict(267) // address keys use 267 bits
		if err != nil {
			return nil, fmt.Errorf("error loading dict - getRoleMembers: %w", err)
		}

		tlbeDict, err := tlbe.NewDictFromDictionary[*address.Address, bool](dict)
		if err != nil {
			return nil, fmt.Errorf("error converting dict to tlbe.Dict - getRoleMembers: %w", err)
		}

		return tlbeDict.AsMap(), nil
	}),
}

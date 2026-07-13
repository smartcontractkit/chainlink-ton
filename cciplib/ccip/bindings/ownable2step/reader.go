package ownable2step

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

var (
	GetOwner        = MakeGetOwner()        // default (owner) role - owner getter
	GetPendingOwner = MakeGetPendingOwner() // default (owner) role - pending owner getter
	AddressRes      = tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		ownerSlice, err := r.Slice(0)
		if err != nil {
			return nil, err
		}

		return ownerSlice.LoadAddr()
	})
)

// MakeGetOwner creates a getter for the owner address, for a specified role (prefix).
func MakeGetOwner(role ...string) tvm.Getter[struct{}, *address.Address] {
	_role := ""
	if len(role) > 0 {
		_role = role[0]
	}

	return tvm.Getter[struct{}, *address.Address]{
		Name:    prefixGetter("owner", _role),
		Decoder: AddressRes,
	}
}

// MakeGetPendingOwner creates a getter for the pending owner address, for a specified role (prefix).
func MakeGetPendingOwner(role ...string) tvm.Getter[struct{}, *address.Address] {
	_role := ""
	if len(role) > 0 {
		_role = role[0]
	}

	return tvm.Getter[struct{}, *address.Address]{
		Name:    prefixGetter("pendingOwner", _role),
		Decoder: AddressRes,
	}
}

func prefixGetter(getterMethodName string, role string) string {
	if role == "" {
		return getterMethodName
	}

	return role + "_" + getterMethodName
}

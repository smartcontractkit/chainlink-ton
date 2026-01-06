package ownable2step

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var AddressRes = tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
	ownerSlice, err := r.Slice(0)
	if err != nil {
		return nil, err
	}

	return ownerSlice.LoadAddr()
})

func MakeGetOwner(role ...string) tvm.Getter[struct{}, *address.Address] {
	return tvm.Getter[struct{}, *address.Address]{
		Name:    prefixGetter("owner", role),
		Decoder: AddressRes,
	}
}

var GetOwner = MakeGetOwner()

func MakeGetPendingOwner(role ...string) tvm.Getter[struct{}, *address.Address] {
	return tvm.Getter[struct{}, *address.Address]{
		Name:    prefixGetter("pendingOwner", role),
		Decoder: AddressRes,
	}
}

var GetPendingOwner = MakeGetPendingOwner()

func prefixGetter(getterMethodName string, role []string) string {
	if len(role) > 1 {
		panic("only one role argument is allowed")
	}
	if len(role) == 1 {
		return role[0] + "_" + getterMethodName
	}
	return getterMethodName
}

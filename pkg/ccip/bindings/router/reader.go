package router

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var GetRMNOwner = ownable2step.MakeGetOwner("rmn")
var GetRMNPendingOwner = ownable2step.MakeGetPendingOwner("rmn")

// GetOwner gets the owner of the Router contract
var GetOwner = ownable2step.GetOwner

// GetPendingOwner gets the pending owner of the Router contract
var GetPendingOwner = ownable2step.GetPendingOwner

// GetOnRamp gets the onRamp address for a given destination chain selector
var GetOnRamp = tvm.Getter[uint64, *address.Address]{
	Name: OnRampGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
		onRampSlice, err := r.Slice(0)
		if err != nil {
			return nil, err
		}
		return onRampSlice.LoadAddr()
	}),
}

// GetDestChainSelectors gets all destination chain selectors
var GetDestChainSelectors = tvm.NewNoArgsGetter(tvm.NoArgsOpts[[]uint64]{
	Name: DestChainsGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) ([]uint64, error) {
		// This is a special case - returns a tuple of chain selectors
		// The caller should use parser.ParseLispTuple(result.AsTuple()) to get the slice
		// For now, return empty slice and let the caller handle the parsing
		return nil, nil
	}),
})

package router

import (
	"fmt"
	"math/big"

	"github.com/samber/lo"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/parser"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

var GetRMNOwner = ownable2step.MakeGetOwner("rmn")
var GetRMNPendingOwner = ownable2step.MakeGetPendingOwner("rmn")

// GetOwner gets the owner of the Router contract
var GetOwner = ownable2step.GetOwner

// GetPendingOwner gets the pending owner of the Router contract
var GetPendingOwner = ownable2step.GetPendingOwner

// GetOnRamp gets the onRamp address for a given destination chain selector
var GetOnRamp = tvm.Getter[uint64, *address.Address]{
	Name: "onRamp",
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
	Name: "destChainSelectors",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) ([]uint64, error) {
		selectors, err := parser.ParseLispTuple[*big.Int](r.AsTuple())
		if err != nil {
			return nil, err
		}
		return lo.Map(selectors, func(x *big.Int, _ int) uint64 { return x.Uint64() }), nil
	}),
})

// GetVerifyNotCursed checks if the input subject is not cursed.
var GetVerifyNotCursed = tvm.Getter[*big.Int, bool]{
	Name: "verifyNotCursed",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
		// Parse result as bool
		notCursed, err := r.Int(0)
		if err != nil {
			return false, fmt.Errorf("failed to parse verifyNotCursed result: %w", err)
		}

		return notCursed.Cmp(big.NewInt(0)) != 0, nil
	}),
}

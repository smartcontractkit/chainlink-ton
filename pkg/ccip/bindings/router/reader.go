package router

import (
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"fmt"
	"math/big"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"

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
		return parser.ParseLispTuple(r.AsTuple()), nil
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

package router

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var GetRMNOwner = ownable2step.MakeGetOwner("rmn")
var GetRMNPendingOwner = ownable2step.MakeGetPendingOwner("rmn")

var GetVerifyNotCursed = tvm.Getter[*big.Int, bool]{
	Name: "verifyNotCursed",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
		// Parse result as bool
		notCursed, err := r.Int(0)
		if err != nil {
			return false, fmt.Errorf("failed to parse verifyNotCursed result: %w", err)
		}

		// verifyNotCursed returns 0 (false) if cursed, -1 (true) if not cursed
		// We want to return true if cursed
		return notCursed.Cmp(big.NewInt(0)) == 0, nil
	}),
}

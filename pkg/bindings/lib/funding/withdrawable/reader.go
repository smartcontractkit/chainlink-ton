package withdrawable

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

var GetReserve = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*big.Int]{
	Name: "reserve",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*big.Int, error) {
		ri, err := r.Int(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Int(0) - reserve: %w", err)
		}

		return ri, nil
	}),
})

package timelock

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var GetMinDelay = tvm.NewNoArgsGetter(tvm.NoArgsOpts[uint64]{
	Name: "getMinDelay",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (uint64, error) {
		rs, err := r.Int(0)
		if err != nil {
			return 0, fmt.Errorf("error getting minDelay slice: %w", err)
		}

		return rs.Uint64(), nil
	}),
})

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

var GetRoleMember = tvm.Getter[GetRoleMemberArgs, *address.Address]{
	Name: "getRoleMember",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*address.Address, error) {
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

var BoolRes = tvm.NewResultDecoder(func(r *ton.ExecutionResult) (bool, error) {
	rs, err := r.Int(0)
	if err != nil {
		return false, fmt.Errorf("error getting bool result: %w", err)
	}

	return rs.Uint64() == 1, nil
})

var IsOperation = tvm.Getter[*big.Int, bool]{
	Name:    "isOperation",
	Decoder: BoolRes,
}

var IsOperationPending = tvm.Getter[*big.Int, bool]{
	Name:    "isOperationPending",
	Decoder: BoolRes,
}

var IsOperationReady = tvm.Getter[*big.Int, bool]{
	Name:    "isOperationReady",
	Decoder: BoolRes,
}

var IsOperationDone = tvm.Getter[*big.Int, bool]{
	Name:    "isOperationDone",
	Decoder: BoolRes,
}

var IsOperationError = tvm.Getter[*big.Int, bool]{
	Name:    "isOperationError",
	Decoder: BoolRes,
}

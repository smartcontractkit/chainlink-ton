package timelock

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
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
		isNil, err := r.IsNil(0)
		if err != nil {
			return nil, fmt.Errorf("error checking if getRoleMember result is nil: %w", err)
		}
		// If the result is nil, return nil address
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

var GetOpPendingInfo = tvm.NewNoArgsGetter(tvm.NoArgsOpts[OpPendingInfo]{
	Name: "getOpPendingInfo",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (OpPendingInfo, error) {
		validAfter, err := r.Int(0)
		if err != nil {
			return OpPendingInfo{}, fmt.Errorf("error getting Int(0) - validAfter: %w", err)
		}

		opFinalizationTimeout, err := r.Int(1)
		if err != nil {
			return OpPendingInfo{}, fmt.Errorf("error getting Int(1) - opFinalizationTimeout: %w", err)
		}

		opPendingID, err := r.Int(2)
		if err != nil {
			return OpPendingInfo{}, fmt.Errorf("error getting Int(2) - opPendingID: %w", err)
		}

		return OpPendingInfo{
			ValidAfter:            validAfter.Uint64(),
			OpFinalizationTimeout: uint32(opFinalizationTimeout.Uint64()),
			OpPendingID:           tlbe.NewUint256(opPendingID),
		}, nil
	}),
})

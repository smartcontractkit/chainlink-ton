package timelock

import (
	"fmt"
	"math/big"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

var GetMinDelay = tvm.GetterNoArgs[uint64]{
	Name: "getMinDelay",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (uint64, error) {
		rs, err := r.Int(0)
		if err != nil {
			return 0, fmt.Errorf("error getting minDelay slice: %w", err)
		}

		return rs.Uint64(), nil
	}),
}

var GetRoleMemberCount = tvm.Getter[*big.Int, uint64]{
	Name: "getRoleMemberCount",
	Encoder: tvm.NewArgsEncoder(func(role *big.Int) ([]any, error) {
		return []any{role}, nil
	}),
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
	Encoder: tvm.NewArgsEncoder(func(args GetRoleMemberArgs) ([]any, error) {
		return []any{args.Role, args.Index}, nil
	}),
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

var BigIntArg = tvm.NewArgsEncoder(func(arg *big.Int) ([]any, error) {
	return []any{arg}, nil
})

var IsOperation = tvm.Getter[*big.Int, bool]{
	Name:    "isOperation",
	Encoder: BigIntArg,
	Decoder: BoolRes,
}

var IsOperationPending = tvm.Getter[*big.Int, bool]{
	Name:    "isOperationPending",
	Encoder: BigIntArg,
	Decoder: BoolRes,
}

var IsOperationReady = tvm.Getter[*big.Int, bool]{
	Name:    "isOperationReady",
	Encoder: BigIntArg,
	Decoder: BoolRes,
}

var IsOperationDone = tvm.Getter[*big.Int, bool]{
	Name:    "isOperationDone",
	Encoder: BigIntArg,
	Decoder: BoolRes,
}

var IsOperationError = tvm.Getter[*big.Int, bool]{
	Name:    "isOperationError",
	Encoder: BigIntArg,
	Decoder: BoolRes,
}

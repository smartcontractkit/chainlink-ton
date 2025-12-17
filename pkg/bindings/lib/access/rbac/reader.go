package rbac

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

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

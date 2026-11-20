package wrappers

import (
	"fmt"
	"math"

	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

// NewUint32Getter returns a getter for a method without arguments whose single
// result is a uint32.
func NewUint32Getter(name string) tvm.Getter[tvm.NoArgs, uint32] {
	return tvm.NewNoArgsGetter(tvm.NoArgsOpts[uint32]{
		Name: name,
		Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (uint32, error) {
			val, err := decodeUint(r, math.MaxUint32)
			return uint32(val), err
		}),
	})
}

// NewUint64Getter returns a getter for a method without arguments whose single
// result is a uint64.
func NewUint64Getter(name string) tvm.Getter[tvm.NoArgs, uint64] {
	return tvm.NewNoArgsGetter(tvm.NoArgsOpts[uint64]{
		Name: name,
		Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (uint64, error) {
			return decodeUint(r, math.MaxUint64)
		}),
	})
}

func decodeUint(r *ton.ExecutionResult, maxValue uint64) (uint64, error) {
	val, err := r.Int(0)
	if err != nil {
		return 0, fmt.Errorf("failed to extract value: %w", err)
	}
	if !val.IsUint64() || val.Uint64() > maxValue {
		return 0, fmt.Errorf("value %s out of range [0, %d]", val, maxValue)
	}
	return val.Uint64(), nil
}

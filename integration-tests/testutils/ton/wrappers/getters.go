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
			val, err := decodeUint64(r)
			if err != nil {
				return 0, err
			}
			if val > math.MaxUint32 {
				return 0, fmt.Errorf("value %d out of range [0, %d]", val, uint32(math.MaxUint32))
			}
			return uint32(val), nil
		}),
	})
}

// NewUint64Getter returns a getter for a method without arguments whose single
// result is a uint64.
func NewUint64Getter(name string) tvm.Getter[tvm.NoArgs, uint64] {
	return tvm.NewNoArgsGetter(tvm.NoArgsOpts[uint64]{
		Name:    name,
		Decoder: tvm.NewResultDecoder(decodeUint64),
	})
}

func decodeUint64(r *ton.ExecutionResult) (uint64, error) {
	val, err := r.Int(0)
	if err != nil {
		return 0, fmt.Errorf("failed to extract value: %w", err)
	}
	if !val.IsUint64() {
		return 0, fmt.Errorf("value %s out of range [0, %d]", val, uint64(math.MaxUint64))
	}
	return val.Uint64(), nil
}

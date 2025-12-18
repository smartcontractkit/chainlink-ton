package tvm

import (
	"crypto/rand"
	"math"
	"math/big"
)

const (
	SizeUINT8   = 8
	SizeUINT32  = 32
	SizeUINT64  = 64
	SizeUINT128 = 128
	SizeUINT160 = 160
	SizeUINT256 = 256
)

func RandomQueryID() (uint64, error) {
	_max := new(big.Int).SetUint64(math.MaxUint64)
	nBig, err := rand.Int(rand.Reader, _max)
	if err != nil {
		return 0, err
	}

	return nBig.Uint64(), nil
}

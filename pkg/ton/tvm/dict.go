package tvm

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const (
	KeyUINT8   = 8
	KeyUINT256 = 256
)

func MakeDict[T any](m map[*big.Int]T, keySz uint) (*cell.Dictionary, error) {
	dict := cell.NewDict(keySz)

	for k, v := range m {
		c, err := tlb.ToCell(v)
		if err != nil {
			return nil, fmt.Errorf("failed to encode value as cell: %w", err)
		}

		err = dict.SetIntKey(k, c)
		if err != nil {
			return nil, fmt.Errorf("failed to set int key: %w", err)
		}
	}

	return dict, nil
}

func MakeDictFrom[T any](data []T, keySz uint) (*cell.Dictionary, error) {
	m := make(map[*big.Int]T, len(data))
	for i, v := range data {
		m[big.NewInt(int64(i))] = v
	}
	return MakeDict(m, keySz)
}

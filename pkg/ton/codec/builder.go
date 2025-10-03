package codec

import (
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type CellCodec[T any] interface {
	Encode(data T) (*cell.Builder, error)
	Decode(src *cell.Slice) (T, error)
}

func TLBCodec[T any]() CellCodec[T] {
	return &tlbCodec[T]{}
}

type tlbCodec[T any] struct{}

func (c *tlbCodec[T]) Encode(data T) (*cell.Builder, error) {
	cell, err := tlb.ToCell(data)
	return cell.ToBuilder(), err
}

func (c *tlbCodec[T]) Decode(src *cell.Slice) (T, error) {
	var data T
	err := tlb.LoadFromCell(&data, src)
	return data, err
}

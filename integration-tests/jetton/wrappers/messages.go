package wrappers

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type ForwardPayload struct {
	cell  *cell.Cell
	slice *cell.Slice
}

func NewForwardPayload[T *cell.Cell | *cell.Slice](payload T) ForwardPayload {
	switch p := any(payload).(type) {
	case *cell.Cell:
		return ForwardPayload{cell: p}
	case *cell.Slice:
		return ForwardPayload{slice: p}
	default:
		return ForwardPayload{}
	}
}

func (c *ForwardPayload) ToCell() (*cell.Cell, error) {
	b := cell.BeginCell()
	err := b.StoreMaybeRef(c.cell)
	if err != nil {
		return nil, fmt.Errorf("failed to store cell in forward payload: %w", err)
	}
	if c.slice != nil {
		err = b.StoreBuilder(c.slice.ToBuilder())
		if err != nil {
			return nil, fmt.Errorf("failed to store slice in forward payload: %w", err)
		}
	}
	return b.EndCell(), nil
}

type jettonInternalTransfer struct {
	_                tlb.Magic        `tlb:"#178d4519"`
	QueryID          uint64           `tlb:"## 64"`
	Amount           *big.Int         `tlb:"var uint 16"`
	From             *address.Address `tlb:"addr"`
	ResponseAddress  *address.Address `tlb:"addr"`
	ForwardTonAmount *big.Int         `tlb:"var uint 16"`
	ForwardPayload   *cell.Cell       `tlb:"."`
}

func (jettonInternalTransfer) OpCode() uint64 {
	return 0x178d4519
}

package wrappers

import (
	"fmt"

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
	Amount           tlb.Coins        `tlb:"."`
	From             *address.Address `tlb:"addr"`
	ResponseAddress  *address.Address `tlb:"addr"`
	ForwardTonAmount tlb.Coins        `tlb:"."`
	ForwardPayload   *cell.Cell       `tlb:"."`
}

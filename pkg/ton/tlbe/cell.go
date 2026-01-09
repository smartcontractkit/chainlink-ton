package tlbe // tlb extras

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// Cell is a generic wrapper around cell.Cell, adds underlying type information T.
type Cell[T any] cell.Cell

// NewCellFrom creates a new Cell[T] from a value of type T.
func NewCellFrom[T any](v T) (*Cell[T], error) {
	c, err := tlb.ToCell(v)
	if err != nil {
		return nil, fmt.Errorf("failed to convert value to cell: %w", err)
	}

	cellT := Cell[T](*c)

	return &cellT, nil
}

// ManyCellsFrom creates multiple Cell[T] from a slice of values of type T.
func ManyCellsFrom[T any](values []T) ([]*Cell[T], error) {
	cells := make([]*Cell[T], 0, len(values))
	for _, v := range values {
		c, err := NewCellFrom(v)
		if err != nil {
			return nil, fmt.Errorf("failed to wrap value to cell: %w", err)
		}
		cells = append(cells, c)
	}

	return cells, nil
}

func (c *Cell[T]) ToValue() (T, error) {
	var v T
	err := tlb.LoadFromCell(&v, (*cell.Cell)(c).BeginParse())
	if err != nil {
		return v, fmt.Errorf("failed to load value from cell: %w", err)
	}

	return v, nil
}

func (c *Cell[T]) ToCell() (*cell.Cell, error) {
	return (*cell.Cell)(c), nil
}

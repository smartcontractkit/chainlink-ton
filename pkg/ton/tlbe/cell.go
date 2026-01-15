package tlbe // tlb extras

import (
	"fmt"
	"reflect"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// Cell is a generic wrapper around cell.Cell, adds underlying type information T.
type Cell[T any] cell.Cell

// NewCellFrom creates a new Cell[T] from a value of type T.
//
// The type parameter T must be a value type, not a pointer type.
// For example, use Cell[tlb.InternalMessage], not Cell[tlb.InternalMessage].
func NewCellFrom[T any](v T) (*Cell[T], error) {
	// Check if T is a pointer type and fail fast with a clear error
	var zero T
	if reflect.TypeOf(zero) != nil && reflect.TypeOf(zero).Kind() == reflect.Ptr {
		return nil, fmt.Errorf("Cell type parameter T must be a value type, not a pointer type (got %T)", zero)
	}

	_c, err := tlb.ToCell(v)
	if err != nil {
		return nil, fmt.Errorf("failed to convert value to cell: %w", err)
	}

	c := Cell[T](*_c)

	return &c, nil
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

// ToValue converts the cell back to its original value type T.
//
// If T is a pointer type, this will fail because tlb.LoadFromCell requires
// a pointer to a value type, not a pointer to a pointer.
func (c *Cell[T]) ToValue() (T, error) {
	var v T
	err := tlb.LoadFromCell(&v, c.ToCell().BeginParse())
	if err != nil {
		// Provide a hint if the error might be due to using a pointer type
		if reflect.TypeOf(v) != nil && reflect.TypeOf(v).Kind() == reflect.Ptr {
			return v, fmt.Errorf("failed to load value from cell (hint: T should be a value type, not a pointer): %w", err)
		}
		return v, fmt.Errorf("failed to load value from cell: %w", err)
	}

	return v, nil
}

func (c *Cell[T]) ToCell() *cell.Cell {
	return (*cell.Cell)(c)
}

func (c *Cell[T]) UnmarshalJSON(data []byte) error {
	var _c cell.Cell
	if err := _c.UnmarshalJSON(data); err != nil {
		return err
	}

	*c = Cell[T](_c)
	return nil
}

func (c *Cell[T]) MarshalJSON() ([]byte, error) {
	return c.ToCell().MarshalJSON()
}

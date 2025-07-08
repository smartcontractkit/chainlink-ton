package common

import (
	"errors"
	"fmt"
	"math"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// PackArrayWithRefChaining packs a slice of any serializable type T into a linked cell structure,
// storing each element as a cell reference. When only one reference slot is left, it starts a new cell
// and uses the last reference for chaining.
func PackArrayWithRefChaining[T any](array []T) (*cell.Cell, error) {
	builder := cell.BeginCell()
	cells := []*cell.Builder{builder}

	for i, v := range array {
		c, err := tlb.ToCell(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize element %d: %w", i, err)
		}

		// If only one ref left, start a new cell for chaining
		if builder.RefsLeft() == 1 {
			builder = cell.BeginCell()
			cells = append(cells, builder)
		}
		if err := builder.StoreRef(c); err != nil {
			return nil, fmt.Errorf("failed to store element %d: %w", i, err)
		}
	}

	// Link cells in reverse order
	var next *cell.Cell
	for i := len(cells) - 1; i >= 0; i-- {
		if next != nil {
			if err := cells[i].StoreRef(next); err != nil {
				return nil, fmt.Errorf("failed to store ref at cell %d: %w", i, err)
			}
		}
		next = cells[i].EndCell()
	}
	return next, nil
}

// UnPackArrayWithRefChaining unpacks a linked cell structure created by PackArrayWithRefChaining
// into a slice of type T. Each element is stored as a cell reference. If a cell has 4 references,
// the last reference is used for chaining to the next cell and is not decoded as an element.
func UnPackArrayWithRefChaining[T any](root *cell.Cell) ([]T, error) {
	var result []T
	curr := root
	for curr != nil {
		length := curr.RefsNum()

		// sanity check for length
		if length > uint(math.MaxInt) {
			return result, fmt.Errorf("length %d overflows int", length)
		}
		for i := 0; i < int(length); i++ {
			ref, err := curr.PeekRef(i)
			if err != nil {
				return nil, fmt.Errorf("failed to unpack array, at ref index %d: %w", i, err)
			}
			if length == 4 && i == 3 { // chaining happens only when there are 4 refs, at index 3
				curr = ref
				break // move to next cell, do not decode this ref
			}
			var v T
			if err := tlb.LoadFromCell(&v, ref.BeginParse()); err != nil {
				return nil, fmt.Errorf("failed to decode element: %w", err)
			}
			result = append(result, v)
		}
		if length < 4 {
			break
		}
	}
	return result, nil
}

// PackArrayWithStaticType packs a slice of any serializable type T into a linked cell structure.
// Elements are stored directly in the cell's bits. If an element does not fit, a new cell is started.
// Cells are linked via references for arrays that span multiple cells.
func PackArrayWithStaticType[T any](array []T) (*cell.Cell, error) {
	builder := cell.BeginCell()
	cells := []*cell.Builder{builder}

	for i, v := range array {
		c, err := tlb.ToCell(v)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize element %d: %w", i, err)
		}
		if c.BitsSize() > builder.BitsLeft() {
			builder = cell.BeginCell()
			cells = append(cells, builder)
		}
		if err := builder.StoreBuilder(c.ToBuilder()); err != nil {
			return nil, fmt.Errorf("failed to store element %d: %w", i, err)
		}
	}

	// Link cells in reverse order
	var next *cell.Cell
	for i := len(cells) - 1; i >= 0; i-- {
		if next != nil {
			if err := cells[i].StoreRef(next); err != nil {
				return nil, fmt.Errorf("failed to store ref at cell %d: %w", i, err)
			}
		}
		next = cells[i].EndCell()
	}
	return next, nil
}

// UnpackArrayWithStaticType unpacks a linked cell structure created by PackArrayWithStaticType
// into a slice of type T. Elements are read from the cell's bits, and the function follows references
// to subsequent cells as needed.
func UnpackArrayWithStaticType[T any](root *cell.Cell) ([]T, error) {
	var result []T
	curr := root
	for curr != nil {
		s := curr.BeginParse()
		for s.BitsLeft() > 0 {
			var v T
			if err := tlb.LoadFromCell(&v, s); err != nil {
				return nil, fmt.Errorf("failed to decode element: %w", err)
			}
			result = append(result, v)
		}
		if curr.RefsNum() > 0 {
			ref, err := curr.PeekRef(0)
			if err != nil {
				return nil, fmt.Errorf("failed to get next cell ref: %w", err)
			}
			curr = ref
		} else {
			curr = nil
		}
	}
	return result, nil
}

// PackByteArrayToCell packs a byte array into a linked cell structure, supporting empty arrays.
func PackByteArrayToCell(data []byte) (*cell.Cell, error) {
	if len(data) == 0 {
		return nil, nil
	}
	cells := []*cell.Builder{cell.BeginCell()}
	curr := cells[0]

	for offset := 0; offset < len(data); {
		bytesFit := curr.BitsLeft() / 8
		remainingBytes := len(data) - offset

		// sanity check for bytesFit before int conversion
		if bytesFit > uint(math.MaxInt) {
			return nil, fmt.Errorf("bytesFit %d overflows int", bytesFit)
		}

		writeLen := remainingBytes
		if int(bytesFit) < remainingBytes {
			// current cell is smaller than remaining data, write as much as fits in the current cell
			writeLen = int(bytesFit)
		}

		// sanity check for writeLen before int conversion
		if writeLen < 0 {
			return nil, fmt.Errorf("writeLen is negative: %d", writeLen)
		}

		if bytesFit > 0 {
			if err := curr.StoreSlice(data[offset:offset+writeLen], uint(writeLen)*8); err != nil {
				return nil, fmt.Errorf("failed to store bytes: %w", err)
			}
			offset += writeLen
		} else {
			curr = cell.BeginCell()
			cells = append(cells, curr)
		}
	}

	var next *cell.Cell
	for i := len(cells) - 1; i >= 0; i-- {
		if next != nil {
			if err := cells[i].StoreRef(next); err != nil {
				return nil, fmt.Errorf("failed to link cell: %w", err)
			}
		}
		next = cells[i].EndCell()
	}
	return next, nil
}

// UnloadCellToByteArray unpacks a linked cell structure into a byte array, supporting empty arrays.
func UnloadCellToByteArray(c *cell.Cell) ([]byte, error) {
	if c == nil {
		return []byte{}, nil
	}
	var result []byte
	curr := c
	for curr != nil {
		s := curr.BeginParse()
		for s.BitsLeft() > 0 {
			part, err := s.LoadSlice(s.BitsLeft())
			if err != nil {
				return nil, fmt.Errorf("failed to load bytes: %w", err)
			}
			result = append(result, part...)
		}
		if curr.RefsNum() > 0 {
			ref, err := curr.PeekRef(0)
			if err != nil {
				return nil, fmt.Errorf("failed to get next cell ref: %w", err)
			}
			curr = ref
		} else {
			curr = nil
		}
	}
	return result, nil
}

// Pack2DByteArrayToCell packs a 2D byte array into a linked cell structure, supporting empty arrays.
func Pack2DByteArrayToCell(arrays [][]byte) (*cell.Cell, error) {
	if len(arrays) == 0 {
		return nil, nil
	}
	builder := cell.BeginCell()
	cells := []*cell.Builder{builder}

	for _, data := range arrays {
		length := len(data)
		if length > 0xFFFF {
			return nil, fmt.Errorf("byte array too long: %d", length)
		}
		if builder.BitsLeft() < 16 {
			builder = cell.BeginCell()
			cells = append(cells, builder)
		}
		if err := builder.StoreUInt(uint64(length), 16); err != nil {
			return nil, fmt.Errorf("failed to store length: %w", err)
		}
		if length > 0 {
			dataCell, err := PackByteArrayToCell(data)
			if err != nil {
				return nil, fmt.Errorf("failed to pack inner array: %w", err)
			}
			if err := builder.StoreRef(dataCell); err != nil {
				return nil, fmt.Errorf("failed to store ref: %w", err)
			}
		}
	}

	var next *cell.Cell
	for i := len(cells) - 1; i >= 0; i-- {
		if next != nil {
			if err := cells[i].StoreRef(next); err != nil {
				return nil, fmt.Errorf("failed to link cell: %w", err)
			}
		}
		next = cells[i].EndCell()
	}
	return next, nil
}

// Unpack2DByteArrayFromCell unpacks a 2D byte array from a linked cell structure, supporting empty arrays.
func Unpack2DByteArrayFromCell(c *cell.Cell) ([][]byte, error) {
	if c == nil {
		return [][]byte{}, nil
	}
	var result [][]byte
	s := c.BeginParse()
	for s.BitsLeft() > 0 {
		length, err := s.LoadUInt(16)
		if err != nil {
			return nil, fmt.Errorf("failed to load length: %w", err)
		}
		if length > uint64(math.MaxInt) {
			return nil, fmt.Errorf("length %d overflows int", length)
		}
		if length == 0 {
			result = append(result, []byte{})
			continue
		}
		if s.RefsNum() == 0 {
			return nil, errors.New("expected ref for non-empty array")
		}
		ref, err := s.LoadRef()
		if err != nil {
			return nil, fmt.Errorf("failed to load ref: %w", err)
		}
		refCell, err := ref.ToCell()
		if err != nil {
			return nil, fmt.Errorf("failed to convert ref to cell: %w", err)
		}
		data, err := UnloadCellToByteArray(refCell)
		if err != nil {
			return nil, fmt.Errorf("failed to unpack inner array: %w", err)
		}
		if len(data) != int(length) {
			return nil, fmt.Errorf("length mismatch: expected %d, got %d", length, len(data))
		}
		result = append(result, data)
	}
	return result, nil
}

// ----------- Below is wrapper types that implement the ToCell and LoadFromCell methods for packing and unpacking into cell structures. -----------

// SnakeData is a generic type for packing and unpacking slices of any type T into a cell structure.
type SnakeData[T any] []T

// ToCell packs the SnakeData into a cell. It uses PackArray to serialize the data.
// currently this function is not using pointer receiver, lack of support from tonutils-go library https://github.com/xssnick/tonutils-go/issues/340
func (s SnakeData[T]) ToCell() (*cell.Cell, error) {
	return PackArrayWithStaticType(s)
}

// LoadFromCell loads the SnakeData from a cell slice. It uses UnpackArray to deserialize the data.
func (s *SnakeData[T]) LoadFromCell(c *cell.Slice) error {
	cl, err := c.ToCell()
	if err != nil {
		return fmt.Errorf("failed to convert slice to cell: %w", err)
	}
	arr, err := UnpackArrayWithStaticType[T](cl)
	if err != nil {
		return err
	}
	*s = arr
	return nil
}

// SnakeBytes is a byte array type for packing and unpacking into a cell structure.
type SnakeBytes []byte

// ToCell packs the SnakeBytes into a cell. It uses PackByteArrayToCell to serialize the data.
func (s SnakeBytes) ToCell() (*cell.Cell, error) {
	return PackByteArrayToCell(s)
}

// LoadFromCell loads the SnakeBytes from a cell slice. It uses UnloadCellToByteArray to deserialize the data.
func (s *SnakeBytes) LoadFromCell(c *cell.Slice) error {
	cl, err := c.ToCell()
	if err != nil {
		return fmt.Errorf("failed to convert slice to cell: %w", err)
	}
	data, err := UnloadCellToByteArray(cl)
	if err != nil {
		return fmt.Errorf("failed to unpack byte array: %w", err)
	}
	*s = data
	return nil
}

// SnakeBytes2D is a 2D byte array type for packing and unpacking into a cell structure.
type SnakeBytes2D [][]byte

// ToCell packs the SnakeBytes2D into a cell. It uses Pack2DByteArrayToCell to serialize the data.
func (s SnakeBytes2D) ToCell() (*cell.Cell, error) {
	return Pack2DByteArrayToCell(s)
}

// LoadFromCell loads the SnakeBytes2D from a cell slice. It uses Unpack2DByteArrayFromCell to deserialize the data.
func (s *SnakeBytes2D) LoadFromCell(c *cell.Slice) error {
	cl, err := c.ToCell()
	if err != nil {
		return fmt.Errorf("failed to convert slice to cell: %w", err)
	}
	data, err := Unpack2DByteArrayFromCell(cl)
	if err != nil {
		return fmt.Errorf("failed to unpack 2D byte array: %w", err)
	}
	*s = data
	return nil
}

// SnakeRef is a generic type for packing and unpacking slices of any type T into a cell structure with references chaining.
type SnakeRef[T any] []T

// ToCell packs the SnakeRef into a cell. It uses PackArrayWithRefChaining to serialize the data.
func (s SnakeRef[T]) ToCell() (*cell.Cell, error) {
	packed, err := PackArrayWithRefChaining(s)
	if err != nil {
		return nil, err
	}

	return packed, nil
}

// LoadFromCell loads the SnakeRef from a cell slice. It uses UnPackArrayWithRefChaining to deserialize the data.
func (s *SnakeRef[T]) LoadFromCell(c *cell.Slice) error {
	cl, err := c.ToCell()
	if err != nil {
		return fmt.Errorf("failed to convert slice to cell: %w", err)
	}
	arr, err := UnPackArrayWithRefChaining[T](cl)
	if err != nil {
		return err
	}
	*s = arr
	return nil
}

// NewDummyCell returns a cell containing the string "placeholder" in its data.
func NewDummyCell() (*cell.Cell, error) {
	builder := cell.BeginCell()
	payload := []byte("place holder")
	if err := builder.StoreSlice(payload, uint(len(payload))); err != nil {
		return nil, err
	}
	return builder.EndCell(), nil
}

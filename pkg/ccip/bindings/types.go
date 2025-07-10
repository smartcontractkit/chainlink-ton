package bindings

import (
	"fmt"
	"math"
	"math/big"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// Signature represents an ED25519 signature.
type Signature struct {
	Sig []byte `tlb:"bits 512"`
}

// GenericExtraArgsV2 represents generic extra arguments for transactions.
type GenericExtraArgsV2 struct {
	GasLimit                 *big.Int `tlb:"## 256"`
	AllowOutOfOrderExecution bool     `tlb:"bool"`
}

// SVMExtraArgsV1 represents extra arguments for SVM transactions.
type SVMExtraArgsV1 struct {
	ComputeUnits             uint32       `tlb:"## 32"`
	AccountIsWritableBitmap  uint64       `tlb:"## 64"`
	AllowOutOfOrderExecution bool         `tlb:"bool"`
	TokenReceiver            []byte       `tlb:"bits 256"`
	Accounts                 SnakeBytes2D `tlb:"^"`
}

// packArrayWithRefChaining packs a slice of any serializable type T into a linked cell structure,
// storing each element as a cell reference. When only one reference slot is left, it starts a new cell
// and uses the last reference for chaining.
func packArrayWithRefChaining[T any](array []T) (*cell.Cell, error) {
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

// unpackArrayWithRefChaining unpacks a linked cell structure created by packArrayWithRefChaining
// into a slice of type T. Each element is stored as a cell reference. If a cell has 4 references,
// the last reference is used for chaining to the next cell and is not decoded as an element.
func unpackArrayWithRefChaining[T any](root *cell.Cell) ([]T, error) {
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

// packArrayWithStaticType packs a slice of any serializable type T into a linked cell structure.
// Elements are stored directly in the cell's bits. If an element does not fit, a new cell is started.
// Cells are linked via references for arrays that span multiple cells.
func packArrayWithStaticType[T any](array []T) (*cell.Cell, error) {
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

// unpackArrayWithStaticType unpacks a linked cell structure created by packArrayWithStaticType
// into a slice of type T. Elements are read from the cell's bits, and the function follows references
// to subsequent cells as needed.
func unpackArrayWithStaticType[T any](root *cell.Cell) ([]T, error) {
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

// packByteArrayToCell packs a byte array into a linked cell structure, supporting empty arrays.
func packByteArrayToCell(data []byte) (*cell.Cell, error) {
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

// unloadCellToByteArray unpacks a linked cell structure into a byte array, supporting empty arrays.
func unloadCellToByteArray(c *cell.Cell) ([]byte, error) {
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

// pack2DByteArrayToCell packs a 2D byte array into a linked cell structure, supporting empty arrays and handling partial storage.
func pack2DByteArrayToCell(arrays [][]byte) (*cell.Cell, error) {
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

		// Check if we have space for length (16 bits)
		if builder.BitsLeft() < 16 {
			builder = cell.BeginCell()
			cells = append(cells, builder)
		}

		// Store length
		if err := builder.StoreUInt(uint64(length), 16); err != nil {
			return nil, fmt.Errorf("failed to store length: %w", err)
		}

		// Store data inline if length > 0, handling partial storage
		if length > 0 {
			offset := 0
			for offset < length {
				availableBytes := builder.BitsLeft() / 8
				if availableBytes == 0 {
					builder = cell.BeginCell()
					cells = append(cells, builder)
					availableBytes = builder.BitsLeft() / 8
				}

				writeLen := length - offset
				if uint(writeLen) > availableBytes {
					writeLen = int(availableBytes)
				}

				if err := builder.StoreSlice(data[offset:offset+writeLen], uint(writeLen)*8); err != nil {
					return nil, fmt.Errorf("failed to store data: %w", err)
				}
				offset += writeLen
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

// unpack2DByteArrayFromCell unpacks a linked cell structure into a 2D byte array, handling partial storage and empty arrays.
func unpack2DByteArrayFromCell(c *cell.Cell) ([][]byte, error) {
	if c == nil {
		return [][]byte{}, nil
	}
	var result [][]byte
	curr := c

	for curr != nil {
		s := curr.BeginParse()
		for s.BitsLeft() >= 16 {
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

			// Read data that might span multiple cells
			data := make([]byte, 0, length)
			remaining := int(length)

			for remaining > 0 {
				availableBytes := s.BitsLeft() / 8
				if availableBytes == 0 {
					// Move to next cell if current one is exhausted
					if curr.RefsNum() > 0 {
						ref, err := curr.PeekRef(0)
						if err != nil {
							return nil, fmt.Errorf("failed to get next cell ref: %w", err)
						}
						curr = ref
						s = curr.BeginParse()
						continue
					}
					return nil, fmt.Errorf("insufficient data: need %d more bytes", remaining)
				}

				readLen := remaining
				if uint(readLen) > availableBytes {
					readLen = int(availableBytes)
				}

				chunk, err := s.LoadSlice(uint(readLen) * 8)
				if err != nil {
					return nil, fmt.Errorf("failed to load data chunk: %w", err)
				}
				data = append(data, chunk...)
				remaining -= readLen
			}

			result = append(result, data)
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

// ----------- Below is wrapper types that implement the ToCell and LoadFromCell methods for packing and unpacking into cell structures. -----------

// SnakeData is a generic type for packing and unpacking slices of any type T into a cell structure.
type SnakeData[T any] []T

// ToCell packs the SnakeData into a cell. It uses PackArray to serialize the data.
// currently this function is not using pointer receiver, lack of support from tonutils-go library https://github.com/xssnick/tonutils-go/issues/340
func (s SnakeData[T]) ToCell() (*cell.Cell, error) {
	return packArrayWithStaticType(s)
}

// LoadFromCell loads the SnakeData from a cell slice. It uses UnpackArray to deserialize the data.
func (s *SnakeData[T]) LoadFromCell(c *cell.Slice) error {
	cl, err := c.ToCell()
	if err != nil {
		return fmt.Errorf("failed to convert slice to cell: %w", err)
	}
	arr, err := unpackArrayWithStaticType[T](cl)
	if err != nil {
		return err
	}
	*s = arr
	return nil
}

// SnakeBytes is a byte array type for packing and unpacking into a cell structure.
type SnakeBytes []byte

// ToCell packs the SnakeBytes into a cell. It uses packByteArrayToCell to serialize the data.
func (s SnakeBytes) ToCell() (*cell.Cell, error) {
	return packByteArrayToCell(s)
}

// LoadFromCell loads the SnakeBytes from a cell slice. It uses unloadCellToByteArray to deserialize the data.
func (s *SnakeBytes) LoadFromCell(c *cell.Slice) error {
	cl, err := c.ToCell()
	if err != nil {
		return fmt.Errorf("failed to convert slice to cell: %w", err)
	}
	data, err := unloadCellToByteArray(cl)
	if err != nil {
		return fmt.Errorf("failed to unpack byte array: %w", err)
	}
	*s = data
	return nil
}

// SnakeBytes2D is a 2D byte array type for packing and unpacking into a cell structure.
type SnakeBytes2D [][]byte

// ToCell packs the SnakeBytes2D into a cell. It uses pack2DByteArrayToCell to serialize the data.
func (s SnakeBytes2D) ToCell() (*cell.Cell, error) {
	return pack2DByteArrayToCell(s)
}

// LoadFromCell loads the SnakeBytes2D from a cell slice. It uses unpack2DByteArrayFromCell to deserialize the data.
func (s *SnakeBytes2D) LoadFromCell(c *cell.Slice) error {
	cl, err := c.ToCell()
	if err != nil {
		return fmt.Errorf("failed to convert slice to cell: %w", err)
	}
	data, err := unpack2DByteArrayFromCell(cl)
	if err != nil {
		return fmt.Errorf("failed to unpack 2D byte array: %w", err)
	}
	*s = data
	return nil
}

// SnakeRef is a generic type for packing and unpacking slices of any type T into a cell structure with references chaining.
type SnakeRef[T any] []T

// ToCell packs the SnakeRef into a cell. It uses packArrayWithRefChaining to serialize the data.
func (s SnakeRef[T]) ToCell() (*cell.Cell, error) {
	return packArrayWithRefChaining(s)
}

// LoadFromCell loads the SnakeRef from a cell slice. It uses unpackArrayWithRefChaining to deserialize the data.
func (s *SnakeRef[T]) LoadFromCell(c *cell.Slice) error {
	cl, err := c.ToCell()
	if err != nil {
		return fmt.Errorf("failed to convert slice to cell: %w", err)
	}
	arr, err := unpackArrayWithRefChaining[T](cl)
	if err != nil {
		return err
	}
	*s = arr
	return nil
}

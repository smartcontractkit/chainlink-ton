package bindings

import (
	"errors"
	"fmt"
	"math"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// ExecuteReport represents CCIP execute report messages on the TON blockchain.
type ExecuteReport struct {
	SourceChainSelector uint64                       `tlb:"## 64"`
	Messages            SnakeRef[Any2TONRampMessage] `tlb:"^"`
	OffChainTokenData   *cell.Cell                   `tlb:"^"`
	Proofs              SnakeData[Signature]         `tlb:"^"` // []Signature
	ProofFlagBits       *big.Int                     `tlb:"## 256"`
}

// Any2TONRampMessage represents ramp message, which is part of the execute report.
type Any2TONRampMessage struct {
	Header       RampMessageHeader              `tlb:"."`
	Sender       *cell.Cell                     `tlb:"^"`
	Data         *cell.Cell                     `tlb:"^"`
	Receiver     *address.Address               `tlb:"addr"`
	GasLimit     tlb.Coins                      `tlb:"."`
	TokenAmounts SnakeRef[Any2TONTokenTransfer] `tlb:"^"`
}

// RampMessageHeader contains metadata for a ramp message.
type RampMessageHeader struct {
	MessageID           []byte `tlb:"bits 256"`
	SourceChainSelector uint64 `tlb:"## 64"`
	DestChainSelector   uint64 `tlb:"## 64"`
	SequenceNumber      uint64 `tlb:"## 64"`
	Nonce               uint64 `tlb:"## 64"`
}

// Any2TONTokenTransfer represents a token transfer within a ramp message.
type Any2TONTokenTransfer struct {
	SourcePoolAddress *cell.Cell       `tlb:"^"`
	DestPoolAddress   *address.Address `tlb:"addr"`
	DestGasAmount     uint32           `tlb:"## 32"`
	ExtraData         *cell.Cell       `tlb:"^"`
	Amount            *big.Int         `tlb:"## 256"`
}

// Signature represents a cryptographic signature used in the execute report.
type Signature struct {
	Sig []byte `tlb:"bits 512"`
}

type SnakeRef[T any] []T

// ToCell packs the SnakeData into a cell. It uses PackArray to serialize the data.
// TODO Duplicate from commit report gobinding, remove once merged
func (s SnakeRef[T]) ToCell() (*cell.Cell, error) {
	packed, err := PackArrayWithRefChaining(s)
	if err != nil {
		return nil, err
	}

	return packed, nil
}

// LoadFromCell loads the SnakeData from a cell slice. It uses UnpackArray to deserialize the data.
// TODO Duplicate from commit report gobinding, remove once merged
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

// SnakeData is a generic type for packing and unpacking slices of any type T into a cell structure.
// TODO Duplicate from commit report gobinding, remove once merged
type SnakeData[T any] []T

// ToCell packs the SnakeData into a cell. It uses PackArray to serialize the data.
// TODO Duplicate from commit report gobinding, remove once merged
func (s SnakeData[T]) ToCell() (*cell.Cell, error) {
	packed, err := PackArrayWithStaticType(s)
	if err != nil {
		return nil, err
	}

	return packed, nil
}

// LoadFromCell loads the SnakeData from a cell slice. It uses UnpackArray to deserialize the data.
// TODO Duplicate from commit report gobinding, remove once merged
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

// PackArrayWithStaticType packs a slice of any serializable type T into a linked cell structure.
// Elements are stored directly in the cell's bits. If an element does not fit, a new cell is started.
// Cells are linked via references for arrays that span multiple cells.
// TODO duplicated from commit report codec, remove once merged
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
// TODO duplicated from commit report codec, remove once merged
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

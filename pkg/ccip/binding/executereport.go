package binding

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type ExecuteReport struct {
	SourceChainSelector uint64             `tlb:"## 64"`
	Message             Any2TONRampMessage `tlb:"^"`
	OffChainTokenData   *cell.Cell         `tlb:"^"`
	Proofs              *cell.Cell         `tlb:"^"` // []Signature
	ProofFlagBits       *big.Int           `tlb:"## 256"`
}

type Any2TONRampMessage struct {
	Header       RampMessageHeader `tlb:"^"`
	Sender       *cell.Cell        `tlb:"^"`
	Data         *cell.Cell        `tlb:"^"`
	Receiver     *address.Address  `tlb:"addr"`
	GasLimit     []byte            `tlb:"bits 256"`
	TokenAmounts *cell.Dictionary  `tlb:"dict 32"`
}

type RampMessageHeader struct {
	MessageID           []byte `tlb:"bits 256"`
	SourceChainSelector uint64 `tlb:"## 64"`
	DestChainSelector   uint64 `tlb:"## 64"`
	SequenceNumber      uint64 `tlb:"## 64"`
	Nonce               uint64 `tlb:"## 64"`
}

type Any2TONTokenTransfer struct {
	SourcePoolAddress *cell.Cell       `tlb:"^"`
	DestPoolAddress   *address.Address `tlb:"addr"`
	DestGasAmount     uint32           `tlb:"## 32"`
	ExtraData         *cell.Cell       `tlb:"^"` // TBD
	Amount            *big.Int         `tlb:"## 256"`
}

type Signature struct {
	Sig []byte `tlb:"bits 512"`
}

// SliceToDict Helper functions to convert slices to dictionaries for serialization.
// converts a slice of any serializable type T to a *cell.Dictionary.
// The dictionary keys are 32-bit unsigned integers representing the slice index.
func SliceToDict[T any](slice []T) (*cell.Dictionary, error) {
	dict := cell.NewDict(32) // 32-bit keys
	for i, item := range slice {
		keyCell := cell.BeginCell()
		if err := keyCell.StoreUInt(uint64(i), 32); err != nil {
			return nil, fmt.Errorf("failed to store key %d: %w", i, err)
		}
		valueCell, err := tlb.ToCell(item)
		if err != nil {
			// Consider using %T to get the type name in the error message
			return nil, fmt.Errorf("failed to serialize item of type %T at index %d: %w", item, i, err)
		}
		if err := dict.Set(keyCell.EndCell(), valueCell); err != nil {
			return nil, fmt.Errorf("failed to set dict entry %d: %w", i, err)
		}
	}
	return dict, nil
}

// DictToSlice converts a *cell.Dictionary to a slice of any deserializable type T.
func DictToSlice[T any](dict *cell.Dictionary) ([]T, error) {
	var result []T

	if dict == nil {
		return nil, nil
	}

	entries, err := dict.LoadAll()
	if err != nil {
		return nil, err
	}

	for i, entry := range entries {
		var item T
		if err := tlb.LoadFromCell(&item, entry.Value); err != nil {
			return nil, fmt.Errorf("failed to deserialize item of type %T at index %d: %w", item, i, err)
		}
		result = append(result, item)
	}

	return result, nil
}

func PackArray[T any](array []T) (*cell.Cell, error) {
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

func UnpackArray[T any](root *cell.Cell) ([]T, error) {
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
	cells := make([]*cell.Builder, 0)
	curr := cell.BeginCell()
	cells = append(cells, curr)

	for offset := 0; offset < len(data); {
		bitsLeft := curr.BitsLeft()
		bytesFit := int(bitsLeft / 8)
		if bytesFit > len(data)-offset {
			bytesFit = len(data) - offset
		}
		if bytesFit > 0 {
			if err := curr.StoreSlice(data[offset:offset+bytesFit], uint(bytesFit*8)); err != nil {
				return nil, fmt.Errorf("failed to store bytes: %w", err)
			}
			offset += bytesFit
		}
		if offset < len(data) && bytesFit == 0 {
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
		if length == 0 {
			result = append(result, []byte{})
			continue
		}
		if s.RefsNum() == 0 {
			return nil, fmt.Errorf("expected ref for non-empty array")
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

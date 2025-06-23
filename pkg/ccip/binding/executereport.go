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
}

type Any2TONRampMessage struct {
	Header       RampMessageHeader `tlb:"^"`
	Sender       *cell.Cell        `tlb:"^"`
	Data         *cell.Cell        `tlb:"^"`
	Receiver     *address.Address  `tlb:"addr"`
	GasLimit     []byte            `tlb:"bits 256"`
	TokenAmounts *cell.Cell        `tlb:"^"`
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

// TODO: duplicate from commitreport.go, will remove once it merged
// PackArray packs an array of T into a linked cell chain, each cell up to 1023 bits. Note that only one ref is stored in each cell, and one T
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

// TODO: duplicate from commitreport.go, will remove once it merged
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

// Unpack2DByteArrayFromCell unpacks a 2D byte array from a linked cell structure.
func Unpack2DByteArrayFromCell(c *cell.Cell) ([][]byte, error) {
	if c == nil {
		return [][]byte{}, nil
	}

	var result [][]byte
	s := c.BeginParse()
	for s.BitsLeft() > 0 {
		// Read the length (assume 16 bits for length)
		length, err := s.LoadUInt(16)
		if err != nil {
			return nil, fmt.Errorf("failed to load length: %w", err)
		}
		remaining := int(length)
		var data []byte
		curr := s
		if remaining == 0 {
			result = append(result, []byte{})
			// No data to read, just continue to next
			s = curr
			continue
		}
		for remaining > 0 {
			bitsToRead := remaining * 8
			if int(curr.BitsLeft()) < bitsToRead {
				bitsToRead = int(curr.BitsLeft())
			}
			part, err := curr.LoadSlice(uint(bitsToRead))
			if err != nil {
				return nil, fmt.Errorf("failed to load byte array part: %w", err)
			}
			data = append(data, part...)
			remaining -= len(part)
			if remaining > 0 {
				if curr.RefsNum() == 0 {
					return nil, fmt.Errorf("unexpected end of snake cell chain")
				}
				ref, err := curr.LoadRef()
				if err != nil {
					return nil, fmt.Errorf("failed to load next cell ref: %w", err)
				}
				curr = ref
			}
		}
		result = append(result, data)
		// After reading, update s to the current position in the main cell
		s = curr
	}
	return result, nil
}

// Pack2DByteArrayToCell packs a 2D byte array into a linked cell structure.
func Pack2DByteArrayToCell(arrays [][]byte) (*cell.Cell, error) {
	var cells []*cell.Builder
	var currBuilder *cell.Builder

	for i := 0; i < len(arrays); i++ {
		data := arrays[i]
		length := len(data)
		if length > 0xFFFF {
			return nil, fmt.Errorf("byte array too long: %d", length)
		}

		// If no builder yet, or not enough bits for length, start a new cell
		if currBuilder == nil || currBuilder.BitsLeft() < 16 {
			currBuilder = cell.BeginCell()
			cells = append(cells, currBuilder)
		}

		if err := currBuilder.StoreUInt(uint64(length), 16); err != nil {
			return nil, fmt.Errorf("failed to store length: %w", err)
		}

		toWrite := length
		offset := 0

		for toWrite > 0 {
			bitsLeft := currBuilder.BitsLeft()
			bytesFit := bitsLeft / 8
			if int(bytesFit) > toWrite {
				bytesFit = uint(toWrite)
			}
			if bytesFit > 0 {
				if err := currBuilder.StoreSlice(data[offset:uint(offset)+bytesFit], bytesFit*8); err != nil {
					return nil, fmt.Errorf("failed to store bytes: %w", err)
				}
				toWrite -= int(bytesFit)
				offset += int(bytesFit)
			}
			if toWrite > 0 && bytesFit == 0 {
				currBuilder = cell.BeginCell()
				cells = append(cells, currBuilder)
			}
		}
	}

	// Link all cells in reverse order
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

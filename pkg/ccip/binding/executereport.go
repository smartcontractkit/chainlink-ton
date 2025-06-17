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
	Header   RampMessageHeader `tlb:"^"`
	Sender   []byte            `tlb:"bits 512"`
	Data     *cell.Cell        `tlb:"^"`
	Receiver *address.Address  `tlb:"addr"`
	// TODO having GasLimit here will exceed the 1023 bits limit for a single cell, so it is commented out, plus TON seems to use explicit gas limits
	//GasLimit     []byte     `tlb:"bits 256"`
	TokenAmounts *cell.Cell `tlb:"^"` // []Any2TONTokenTransfer
}

type RampMessageHeader struct {
	MessageID           []byte `tlb:"bits 256"`
	SourceChainSelector uint64 `tlb:"## 64"`
	DestChainSelector   uint64 `tlb:"## 64"`
	SequenceNumber      uint64 `tlb:"## 64"`
	Nonce               uint64 `tlb:"## 64"`
}

type Any2TONTokenTransfer struct {
	SourcePoolAddress []byte           `tlb:"bits 256"`
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

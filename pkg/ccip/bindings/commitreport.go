package bindings

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// CommitReport represents the top-level structure for a commit report.
type CommitReport struct {
	PriceUpdates  PriceUpdates `tlb:"^"`
	MerkleRoot    MerkleRoots  `tlb:"^"`
	RMNSignatures *cell.Cell   `tlb:"^"`
}

type MerkleRoots struct {
	BlessedMerkleRoots   *cell.Cell `tlb:"^"`
	UnblessedMerkleRoots *cell.Cell `tlb:"^"`
}

// PriceUpdates holds token and gas price updates.
type PriceUpdates struct {
	TokenPriceUpdates *cell.Cell `tlb:"^"`
	GasPriceUpdates   *cell.Cell `tlb:"^"`
}

// TokenPriceUpdate represents a price update for a token.
type TokenPriceUpdate struct {
	SourceToken *address.Address `tlb:"addr"`
	UsdPerToken *big.Int         `tlb:"## 256"`
}

// GasPriceUpdate represents a gas price update for a chain.
type GasPriceUpdate struct {
	DestChainSelector uint64   `tlb:"## 64"`
	UsdPerUnitGas     *big.Int `tlb:"## 256"`
}

// MerkleRoot represents a Merkle root for a chain's data.
type MerkleRoot struct {
	SourceChainSelector uint64     `tlb:"## 64"`
	OnRampAddress       *cell.Cell `tlb:"."`
	MinSeqNr            uint64     `tlb:"## 64"`
	MaxSeqNr            uint64     `tlb:"## 64"`
	MerkleRoot          []byte     `tlb:"bits 256"`
}

// Signature represents an ED25519 signature.
type Signature struct {
	Sig []byte `tlb:"bits 512"`
}

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

func AddressToCell(addr *address.Address) (*cell.Cell, error) {
	if addr == nil {
		return nil, fmt.Errorf("address cannot be nil")
	}
	builder := cell.BeginCell()
	if err := builder.StoreAddr(addr); err != nil {
		return nil, fmt.Errorf("failed to store address: %w", err)
	}
	return builder.EndCell(), nil
}

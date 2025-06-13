package bindings

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// CommitReportTLB represents the top-level structure for a commit report.
type CommitReportTLB struct {
	PriceUpdates  PriceUpdatesTLB  `tlb:"^"`
	MerkleRoot    MerkleRootsTLB   `tlb:"^"`
	RMNSignatures *cell.Dictionary `tlb:"dict 32"`
}

type MerkleRootsTLB struct {
	BlessedMerkleRoots   *cell.Dictionary `tlb:"dict 32"`
	UnblessedMerkleRoots *cell.Dictionary `tlb:"dict 32"`
}

// PriceUpdatesTLB holds token and gas price updates.
type PriceUpdatesTLB struct {
	TokenPriceUpdates *cell.Dictionary `tlb:"dict 32"`
	GasPriceUpdates   *cell.Dictionary `tlb:"dict 32"`
}

// TokenPriceUpdateTLB represents a price update for a token.
type TokenPriceUpdateTLB struct {
	SourceToken *address.Address `tlb:"addr"`
	UsdPerToken *big.Int         `tlb:"## 256"`
}

// GasPriceUpdateTLB represents a gas price update for a chain.
type GasPriceUpdateTLB struct {
	DestChainSelector uint64   `tlb:"## 64"`
	UsdPerUnitGas     *big.Int `tlb:"## 256"`
}

// MerkleRootTLB represents a Merkle root for a chain's data.
type MerkleRootTLB struct {
	SourceChainSelector uint64 `tlb:"## 64"`
	OnRampAddress       []byte `tlb:"bits 512"`
	MinSeqNr            uint64 `tlb:"## 64"`
	MaxSeqNr            uint64 `tlb:"## 64"`
	MerkleRoot          []byte `tlb:"bits 256"`
}

// SignatureTLB represents an ED25519 signature.
type SignatureTLB struct {
	Sig []byte `tlb:"bits 512"`
}

// Helper functions to convert slices to dictionaries for serialization.

// SliceToDict converts a slice of any serializable type T to a *cell.Dictionary.
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

	if dict == nil || dict.IsEmpty() {
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

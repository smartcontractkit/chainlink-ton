package offramp

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// CommitReport represents the top-level structure for a commit report.
type CommitReport struct {
	PriceUpdates         PriceUpdates     `tlb:"."`
	BlessedMerkleRoots   *cell.Dictionary `tlb:"dict 32"`
	UnblessedMerkleRoots *cell.Dictionary `tlb:"dict 32"`
	RMNSignatures        *cell.Dictionary `tlb:"dict 32"`
}

// PriceUpdates holds token and gas price updates.
type PriceUpdates struct {
	TokenPriceUpdates *cell.Dictionary `tlb:"dict 32"`
	GasPriceUpdates   *cell.Dictionary `tlb:"dict 32"`
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
	SourceChainSelector uint64 `tlb:"## 64"`
	OnRampAddress       []byte `tlb:"bits 256"`
	MinSeqNr            uint64 `tlb:"## 64"`
	MaxSeqNr            uint64 `tlb:"## 64"`
	MerkleRoot          []byte `tlb:"bits 256"`
}

// Signature represents an ECDSA signature.
type Signature struct {
	R *big.Int `tlb:"## 256"`
	S *big.Int `tlb:"## 256"`
	V uint8    `tlb:"## 8"`
}

// Helper functions to convert slices to dictionaries for serialization.

// SliceToDictMerkleRoot converts a []MerkleRoot to a *boc.Dictionary.
func SliceToDictMerkleRoot(slice []MerkleRoot) (*cell.Dictionary, error) {
	dict := cell.NewDict(32) // 32-bit keys
	for i, item := range slice {
		keyCell := cell.BeginCell()
		if err := keyCell.StoreUInt(uint64(i), 32); err != nil {
			return nil, fmt.Errorf("failed to store key %d: %w", i, err)
		}
		valueCell, err := tlb.ToCell(item)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize MerkleRoot at index %d: %w", i, err)
		}
		if err := dict.Set(keyCell.EndCell(), valueCell); err != nil {
			return nil, fmt.Errorf("failed to set dict entry %d: %w", i, err)
		}
	}
	return dict, nil
}

// SliceToDictSignature converts a []Signature to a *boc.Dictionary.
func SliceToDictSignature(slice []Signature) (*cell.Dictionary, error) {
	dict := cell.NewDict(32) // 32-bit keys
	for i, item := range slice {
		keyCell := cell.BeginCell()
		if err := keyCell.StoreUInt(uint64(i), 32); err != nil {
			return nil, fmt.Errorf("failed to store key %d: %w", i, err)
		}
		valueCell, err := tlb.ToCell(item)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize Signature at index %d: %w", i, err)
		}
		if err := dict.Set(keyCell.EndCell(), valueCell); err != nil {
			return nil, fmt.Errorf("failed to set dict entry %d: %w", i, err)
		}
	}
	return dict, nil
}

// SliceToDictTokenPriceUpdate converts a []TokenPriceUpdate to a *boc.Dictionary.
func SliceToDictTokenPriceUpdate(slice []TokenPriceUpdate) (*cell.Dictionary, error) {
	dict := cell.NewDict(32) // 32-bit keys
	for i, item := range slice {
		keyCell := cell.BeginCell()
		if err := keyCell.StoreUInt(uint64(i), 32); err != nil {
			return nil, fmt.Errorf("failed to store key %d: %w", i, err)
		}
		valueCell, err := tlb.ToCell(item)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize TokenPriceUpdate at index %d: %w", i, err)
		}
		if err := dict.Set(keyCell.EndCell(), valueCell); err != nil {
			return nil, fmt.Errorf("failed to set dict entry %d: %w", i, err)
		}
	}
	return dict, nil
}

// SliceToDictGasPriceUpdate converts a []GasPriceUpdate to a *boc.Dictionary.
func SliceToDictGasPriceUpdate(slice []GasPriceUpdate) (*cell.Dictionary, error) {
	dict := cell.NewDict(32) // 32-bit keys
	for i, item := range slice {
		keyCell := cell.BeginCell()
		if err := keyCell.StoreUInt(uint64(i), 32); err != nil {
			return nil, fmt.Errorf("failed to store key %d: %w", i, err)
		}
		valueCell, err := tlb.ToCell(item)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize GasPriceUpdate at index %d: %w", i, err)
		}
		if err := dict.Set(keyCell.EndCell(), valueCell); err != nil {
			return nil, fmt.Errorf("failed to set dict entry %d: %w", i, err)
		}
	}
	return dict, nil
}

// DictToSliceMerkleRoot converts a *boc.Dictionary to a []MerkleRoot.
func DictToSliceMerkleRoot(dict *cell.Dictionary) ([]MerkleRoot, error) {
	var result []MerkleRoot
	d, err := dict.LoadAll()
	if err != nil {
		return nil, err
	}

	for i, valueCell := range d {
		var item MerkleRoot
		if err := tlb.LoadFromCell(&item, valueCell.Value); err != nil {
			return nil, fmt.Errorf("failed to deserialize MerkleRoot at index %d: %w", i, err)
		}
		result = append(result, item)
	}
	return result, nil
}

// DictToSliceSignature converts a *boc.Dictionary to a []Signature.
func DictToSliceSignature(dict *cell.Dictionary) ([]Signature, error) {
	var result []Signature
	d, err := dict.LoadAll()
	if err != nil {
		return nil, err
	}
	for i, slice := range d {
		var item Signature
		if err := tlb.LoadFromCell(&item, slice.Value); err != nil {
			return nil, fmt.Errorf("failed to deserialize Signature at index %d: %w", i, err)
		}
		result = append(result, item)
	}
	return result, nil
}

// DictToSliceTokenPriceUpdate converts a *boc.Dictionary to a []TokenPriceUpdate.
func DictToSliceTokenPriceUpdate(dict *cell.Dictionary) ([]TokenPriceUpdate, error) {
	var result []TokenPriceUpdate
	d, err := dict.LoadAll()
	if err != nil {
		return nil, err
	}
	for i, slice := range d {
		var item TokenPriceUpdate
		if err := tlb.LoadFromCell(&item, slice.Value); err != nil {
			return nil, fmt.Errorf("failed to deserialize TokenPriceUpdate at index %d: %w", i, err)
		}
		result = append(result, item)
	}
	return result, nil
}

// DictToSliceGasPriceUpdate converts a *boc.Dictionary to a []GasPriceUpdate.
func DictToSliceGasPriceUpdate(dict *cell.Dictionary) ([]GasPriceUpdate, error) {
	var result []GasPriceUpdate
	d, err := dict.LoadAll()
	if err != nil {
		return nil, err
	}
	for i, slice := range d {
		var item GasPriceUpdate
		if err := tlb.LoadFromCell(&item, slice.Value); err != nil {
			return nil, fmt.Errorf("failed to deserialize GasPriceUpdate at index %d: %w", i, err)
		}
		result = append(result, item)
	}
	return result, nil
}

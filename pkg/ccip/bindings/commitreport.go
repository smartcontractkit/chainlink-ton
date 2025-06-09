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
	PriceUpdates  PriceUpdates     `tlb:"."`
	MerkleRoot    MerkleRoots      `tlb:"."`
	RMNSignatures *cell.Dictionary `tlb:"dict 32"`
}

type MerkleRoots struct {
	BlessedMerkleRoots   *cell.Dictionary `tlb:"dict 32"`
	UnblessedMerkleRoots *cell.Dictionary `tlb:"dict 32"`
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

// Signature represents an ED25519 signature.
type Signature struct {
	Sig []byte `tlb:"bits 512"`
}

// ToCell implements a custom cell serialization for CommitReport to handle TON's cell reference limitations
func (c *CommitReport) ToCell() (*cell.Cell, error) {
	mainCell := cell.BeginCell()

	// Store PriceUpdates as first reference
	priceUpdatesCell := cell.BeginCell()
	if c.PriceUpdates.TokenPriceUpdates != nil {
		err := priceUpdatesCell.StoreRef(c.PriceUpdates.TokenPriceUpdates.AsCell())
		if err != nil {
			return nil, err
		}
	} else {
		err := priceUpdatesCell.StoreRef(cell.BeginCell().EndCell())
		if err != nil {
			return nil, err
		}
	}

	if c.PriceUpdates.GasPriceUpdates != nil {
		err := priceUpdatesCell.StoreRef(c.PriceUpdates.GasPriceUpdates.AsCell())
		if err != nil {
			return nil, err
		}
	} else {
		err := priceUpdatesCell.StoreRef(cell.BeginCell().EndCell())
		if err != nil {
			return nil, err
		}
	}
	err := mainCell.StoreRef(priceUpdatesCell.EndCell())
	if err != nil {
		return nil, err
	}

	// Store MerkleRoot as second reference
	merkleRootsCell := cell.BeginCell()
	if c.MerkleRoot.BlessedMerkleRoots != nil {
		err = merkleRootsCell.StoreRef(c.MerkleRoot.BlessedMerkleRoots.AsCell())
		if err != nil {
			return nil, err
		}
	} else {
		// if merkle roots are nil, store an empty cell
		err = merkleRootsCell.StoreRef(cell.BeginCell().EndCell())
		if err != nil {
			return nil, err
		}
	}

	if c.MerkleRoot.UnblessedMerkleRoots != nil {
		err = merkleRootsCell.StoreRef(c.MerkleRoot.UnblessedMerkleRoots.AsCell())
		if err != nil {
			return nil, err
		}
	} else {
		// if merkle roots are nil, store an empty cell
		err = merkleRootsCell.StoreRef(cell.BeginCell().EndCell())
		if err != nil {
			return nil, err
		}
	}
	err = mainCell.StoreRef(merkleRootsCell.EndCell())
	if err != nil {
		return nil, err
	}

	// Store RMNSignatures as third reference
	if c.RMNSignatures != nil {
		err = mainCell.StoreRef(c.RMNSignatures.AsCell())
		if err != nil {
			return nil, err
		}
	} else {
		err = mainCell.StoreRef(cell.BeginCell().EndCell())
		if err != nil {
			return nil, err
		}
	}

	return mainCell.EndCell(), nil
}

// LoadFromCell loads CommitReport from a cell
func (c *CommitReport) LoadFromCell(loader *cell.Slice) error {
	// Load PriceUpdates
	priceUpdatesCell, err := loader.LoadRef()
	if err != nil {
		return fmt.Errorf("failed to load price updates cell: %w", err)
	}

	if priceUpdatesCell.RefsNum() < 2 {
		return fmt.Errorf("not enough references in merkle roots cell")
	}

	tokenRef, err := priceUpdatesCell.LoadRef()
	if err != nil {
		return fmt.Errorf("failed to load token price updates dictionary: %w", err)
	}

	tokenDict, err := tokenRef.ToDict(32)
	if err != nil {
		return err
	}

	c.PriceUpdates.TokenPriceUpdates = tokenDict

	gasPriceRef, err := priceUpdatesCell.LoadRef()
	if err != nil {
		return fmt.Errorf("failed to load gas price dictionary: %w", err)
	}

	gasPriceDict, err := gasPriceRef.ToDict(32)
	if err != nil {
		return err
	}
	c.PriceUpdates.GasPriceUpdates = gasPriceDict

	// Load MerkleRoots
	merkleRootsCell, err := loader.LoadRef()
	if err != nil {
		return fmt.Errorf("failed to load merkle roots cell: %w", err)
	}

	if merkleRootsCell.RefsNum() < 2 {
		return fmt.Errorf("not enough references in merkle roots cell")
	}

	blessedRef, err := merkleRootsCell.LoadRef()
	if err != nil {
		return fmt.Errorf("failed to load blessed merkle roots: %w", err)
	}

	blessedDict, err := blessedRef.ToDict(32)
	if err != nil {
		return fmt.Errorf("failed to convert blessed merkle roots to dict: %w", err)
	}
	c.MerkleRoot.BlessedMerkleRoots = blessedDict

	unblessedRef, err := merkleRootsCell.LoadRef()
	if err != nil {
		return fmt.Errorf("failed to load unblessed merkle roots: %w", err)
	}
	unblessedDict, err := unblessedRef.ToDict(32)
	if err != nil {
		return fmt.Errorf("failed to convert unblessed merkle roots to dict: %w", err)
	}
	c.MerkleRoot.UnblessedMerkleRoots = unblessedDict

	// Load RMNSignatures
	sigRef, err := loader.LoadRef()
	if err != nil {
		return fmt.Errorf("failed to load RMN signatures: %w", err)
	}
	if sigRef == nil {
		c.RMNSignatures = nil
		return nil // No signatures to load
	}

	c.RMNSignatures, err = sigRef.ToDict(32)
	if err != nil {
		return fmt.Errorf("failed to convert RMN signatures to dict: %w", err)
	}

	return nil
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

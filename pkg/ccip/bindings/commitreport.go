package bindings

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
)

// CommitReport represents the top-level structure for a commit report.
type CommitReport struct {
	PriceUpdates  PriceUpdates         `tlb:"^"`
	MerkleRoot    MerkleRoots          `tlb:"^"`
	RMNSignatures SnakeData[Signature] `tlb:"^"`
}

// MerkleRoots holds the blessed and unblessed Merkle roots.
type MerkleRoots struct {
	BlessedMerkleRoots   SnakeData[MerkleRoot] `tlb:"^"`
	UnblessedMerkleRoots SnakeData[MerkleRoot] `tlb:"^"`
}

// PriceUpdates holds token and gas price updates.
type PriceUpdates struct {
	TokenPriceUpdates SnakeData[TokenPriceUpdate] `tlb:"^"`
	GasPriceUpdates   SnakeData[GasPriceUpdate]   `tlb:"^"`
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
	OnRampAddress       []byte `tlb:"bits 512"`
	MinSeqNr            uint64 `tlb:"## 64"`
	MaxSeqNr            uint64 `tlb:"## 64"`
	MerkleRoot          []byte `tlb:"bits 256"`
}

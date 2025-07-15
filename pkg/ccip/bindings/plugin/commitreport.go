package plugin

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

// CommitReport represents the top-level structure for a commit report.
type CommitReport struct {
	PriceUpdates  PriceUpdates                `tlb:"^"`
	MerkleRoot    MerkleRoots                 `tlb:"^"`
	RMNSignatures common.SnakeData[Signature] `tlb:"^"`
}

// MerkleRoots holds the blessed and unblessed Merkle roots.
type MerkleRoots struct {
	BlessedMerkleRoots   common.SnakeData[MerkleRoot] `tlb:"^"`
	UnblessedMerkleRoots common.SnakeData[MerkleRoot] `tlb:"^"`
}

// PriceUpdates holds token and gas price updates.
type PriceUpdates struct {
	TokenPriceUpdates common.SnakeData[TokenPriceUpdate] `tlb:"^"`
	GasPriceUpdates   common.SnakeData[GasPriceUpdate]   `tlb:"^"`
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

// Signature represents an ED25519 signature.
type Signature struct {
	Sig []byte `tlb:"bits 256"`
}

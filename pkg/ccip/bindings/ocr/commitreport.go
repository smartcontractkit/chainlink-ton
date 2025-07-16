package ocr

import (
	"math/big"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/xssnick/tonutils-go/address"
)

// SignatureEd25519 represents a signature structure used in commit reports.
type SignatureEd25519 struct {
	R      []byte `tlb:"bits 256"`
	S      []byte `tlb:"bits 256"`
	Signer []byte `tlb:"bits 256"`
}

// CommitReport represents the top-level structure for a commit report.
type CommitReport struct {
	PriceUpdates  PriceUpdates                       `tlb:"^"`
	MerkleRoot    MerkleRoots                        `tlb:"^"`
	RMNSignatures common.SnakeRef[common.SnakeBytes] `tlb:"^"`
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
	SourceChainSelector uint64                   `tlb:"## 64"`
	OnRampAddress       common.CrossChainAddress `tlb:"."`
	MinSeqNr            uint64                   `tlb:"## 64"`
	MaxSeqNr            uint64                   `tlb:"## 64"`
	MerkleRoot          []byte                   `tlb:"bits 256"`
}

package ocr

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

// SignatureEd25519 represents a signature structure used in commit reports.
type SignatureEd25519 struct {
	Data []byte `tlb:"bits 768"`
}

// CommitReport represents the top-level structure for a commit report.
type CommitReport struct {
	MerkleRoots  common.SnakeData[MerkleRoot] `tlb:"^"`
	PriceUpdates *PriceUpdates                `tlb:"maybe ^"`
}

// PriceUpdates holds token and gas price updates.
type PriceUpdates struct {
	TokenPriceUpdates common.SnakeData[TokenPriceUpdate] `tlb:"^"`
	GasPriceUpdates   common.SnakeData[GasPriceUpdate]   `tlb:"^"`
}

// TokenPriceUpdate represents a price update for a token.
type TokenPriceUpdate struct {
	SourceToken *address.Address `tlb:"addr"`
	UsdPerToken *big.Int         `tlb:"## 224"`
}

// GasPriceUpdate represents a gas price update for a chain.
type GasPriceUpdate struct {
	DestChainSelector uint64   `tlb:"## 64"`
	UsdPerUnitGas     *big.Int `tlb:"## 224"` // TODO: this can be split into two 112s
}

// MerkleRoot represents a Merkle root for a chain's data.
type MerkleRoot struct {
	SourceChainSelector uint64                   `tlb:"## 64"`
	OnRampAddress       common.CrossChainAddress `tlb:"."`
	MinSeqNr            uint64                   `tlb:"## 64"`
	MaxSeqNr            uint64                   `tlb:"## 64"`
	MerkleRoot          []byte                   `tlb:"bits 256"`
}

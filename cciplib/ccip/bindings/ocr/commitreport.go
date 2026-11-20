package ocr

import (
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
)

// SignatureEd25519 represents a signature structure used in commit reports.
type SignatureEd25519 struct {
	Data []byte `tlb:"bits 768"`
}

// CommitReport represents the top-level structure for a commit report.
type CommitReport struct {
	PriceUpdates *PriceUpdates                 `tlb:"maybe ^"`
	MerkleRoots  common.SnakedCell[MerkleRoot] `tlb:"^"`
}

// PriceUpdates holds token and gas price updates.
type PriceUpdates struct {
	TokenPriceUpdates common.SnakedCell[TokenPriceUpdate] `tlb:"^"`
	GasPriceUpdates   common.SnakedCell[GasPriceUpdate]   `tlb:"^"`
}

// TokenPriceUpdate represents a price update for a token.
type TokenPriceUpdate struct {
	SourceToken *address.Address `tlb:"addr"`
	UsdPerToken tlbe.BigUint224  `tlb:"."`
}

// GasPriceUpdate represents a gas price update for a chain.
type GasPriceUpdate struct {
	DestChainSelector        uint64          `tlb:"## 64"`
	ExecutionGasPrice        tlbe.BigUint112 `tlb:"."`
	DataAvailabilityGasPrice tlbe.BigUint112 `tlb:"."`
}

// MerkleRoot represents a Merkle root for a chain's data.
type MerkleRoot struct {
	SourceChainSelector uint64                   `tlb:"## 64"`
	OnRampAddress       common.CrossChainAddress `tlb:"."`
	MinSeqNr            uint64                   `tlb:"## 64"`
	MaxSeqNr            uint64                   `tlb:"## 64"`
	MerkleRoot          []byte                   `tlb:"bits 256"`
}

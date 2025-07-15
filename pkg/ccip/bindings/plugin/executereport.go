package plugin

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

// ExecuteReport represents CCIP execute report messages on the TON blockchain.
type ExecuteReport struct {
	SourceChainSelector uint64                              `tlb:"## 64"`
	Messages            common.SnakeRef[Any2TONRampMessage] `tlb:"^"`
	OffChainTokenData   common.SnakeRef[common.SnakeBytes]  `tlb:"^"`
	Proofs              common.SnakeData[Signature]         `tlb:"^"` // []Signature
	ProofFlagBits       *big.Int                            `tlb:"## 256"`
}

// Any2TONRampMessage represents ramp message, which is part of the execute report.
type Any2TONRampMessage struct {
	Header       RampMessageHeader                     `tlb:"."`
	Sender       common.SnakeBytes                     `tlb:"^"`
	Data         common.SnakeBytes                     `tlb:"^"`
	Receiver     *address.Address                      `tlb:"addr"`
	GasLimit     tlb.Coins                             `tlb:"."`
	TokenAmounts common.SnakeRef[Any2TONTokenTransfer] `tlb:"^"`
}

// RampMessageHeader contains metadata for a ramp message.
type RampMessageHeader struct {
	MessageID           []byte `tlb:"bits 256"`
	SourceChainSelector uint64 `tlb:"## 64"`
	DestChainSelector   uint64 `tlb:"## 64"`
	SequenceNumber      uint64 `tlb:"## 64"`
	Nonce               uint64 `tlb:"## 64"`
}

// Any2TONTokenTransfer represents a token transfer within a ramp message.
type Any2TONTokenTransfer struct {
	SourcePoolAddress *cell.Cell       `tlb:"^"`
	DestPoolAddress   *address.Address `tlb:"addr"`
	DestGasAmount     uint32           `tlb:"## 32"`
	ExtraData         *cell.Cell       `tlb:"^"`
	Amount            *big.Int         `tlb:"## 256"`
}

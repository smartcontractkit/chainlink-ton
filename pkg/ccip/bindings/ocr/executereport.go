package ocr

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

// ExecuteReport represents CCIP execute report messages on the TON blockchain.
// Message: single message as cell reference
// OffChainTokenData: vec<vec<u8>> - each token data as separate cell ref
// Proofs: vec<bytes32> - inline 256-bit proofs using SnakeData with Proof wrapper (matches TypeScript asSnakeData)
type ExecuteReport struct {
	SourceChainSelector uint64                             `tlb:"## 64"`
	Message             Any2TVMRampMessage                 `tlb:"^"` // val message = Any2TVMRampMessage.fromCell(report.messages);
	OffChainTokenData   common.SnakeRef[common.SnakeBytes] `tlb:"^"` // vec<vec<u8>>
	Proofs              common.SnakeData[common.Proof]     `tlb:"^"` // vec<bytes32> - inline 256-bit proofs
	ProofFlagBits       *big.Int                           `tlb:"## 256"`
}

// Any2TVMRampMessage represents ramp message, which is part of the execute report.
type Any2TVMRampMessage struct {
	Header       RampMessageHeader                     `tlb:"."`
	Sender       common.CrossChainAddress              `tlb:"^"`
	Data         common.SnakeBytes                     `tlb:"^"`
	Receiver     *address.Address                      `tlb:"addr"`
	GasLimit     tlb.Coins                             `tlb:"."`
	TokenAmounts common.SnakeRef[Any2TVMTokenTransfer] `tlb:"maybe ^"`
}

// RampMessageHeader contains metadata for a ramp message.
type RampMessageHeader struct {
	MessageID           []byte `tlb:"bits 256"`
	SourceChainSelector uint64 `tlb:"## 64"`
	DestChainSelector   uint64 `tlb:"## 64"`
	SequenceNumber      uint64 `tlb:"## 64"`
	Nonce               uint64 `tlb:"## 64"`
}

// Any2TVMTokenTransfer represents a token transfer within a ramp message.
type Any2TVMTokenTransfer struct {
	SourcePoolAddress common.CrossChainAddress `tlb:"^"`
	DestPoolAddress   *address.Address         `tlb:"addr"`
	DestGasAmount     uint32                   `tlb:"## 32"`
	ExtraData         *cell.Cell               `tlb:"^"`
	Amount            *big.Int                 `tlb:"## 256"`
}

// TVM2AnyRampMessage for execution context (includes onramp address in header)
type TVM2AnyRampMessage struct {
	Header        RampMessageHeader      `tlb:"."`
	Sender        *address.Address       `tlb:"addr"`
	Body          TVM2AnyRampMessageBody `tlb:"^"`
	FeeValueJuels *big.Int               `tlb:"## 96"`
}

type TVM2AnyRampMessageBody struct {
	Receiver       common.CrossChainAddress `tlb:"^"`
	Data           common.SnakeBytes        `tlb:"^"`
	ExtraArgs      *cell.Cell               `tlb:"^"`
	TokenAmounts   *cell.Cell               `tlb:"^"` // TODO: common.SnakeRef[TVM2AnyTokenTransfer] once defined
	FeeToken       *address.Address         `tlb:"addr"`
	FeeTokenAmount *big.Int                 `tlb:"## 256"`
}

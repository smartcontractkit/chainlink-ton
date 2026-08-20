package ocr

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/common"
)

// ExecuteReport represents CCIP execute report messages on the TON blockchain.
// Message: single message as cell reference
// OffChainTokenData: vec<vec<u8>> - currently unused cell reference as on-chain representation
// Proofs: vec<bytes32> - inline 256-bit proofs using SnakedCell with Proof wrapper (matches TypeScript asSnakeData)
type ExecuteReport struct {
	SourceChainSelector uint64                          `tlb:"## 64"`
	Message             Any2TVMRampMessage              `tlb:"^"` // val message = Any2TVMRampMessage.fromCell(report.messages);
	OffChainTokenData   *cell.Cell                      `tlb:"^"` // vec<vec<u8>>
	Proofs              common.SnakedCell[common.Proof] `tlb:"^"` // vec<bytes32> - inline 256-bit proofs
	ProofFlagBits       *big.Int                        `tlb:"## 256"`
}

// Any2TVMRampMessage represents ramp message, which is part of the execute report.
type Any2TVMRampMessage struct {
	Header       RampMessageHeader                       `tlb:"."`
	Sender       common.CrossChainAddress                `tlb:"^"`
	Data         common.SnakeBytes                       `tlb:"^"`
	Receiver     *address.Address                        `tlb:"addr"`
	GasLimit     tlb.Coins                               `tlb:"."`
	TokenAmounts common.SnakedCell[Any2TVMTokenTransfer] `tlb:"maybe ^"`
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
	Receiver  common.CrossChainAddress `tlb:"^"`
	Data      common.SnakeBytes        `tlb:"^"`
	ExtraArgs *cell.Cell               `tlb:"^"`
	// TokenTransfer is empty when the message carries no token transfer, or a one-item
	// SnakedCell when it does; the current TVM2Any flow supports a single token transfer
	// per message.
	TokenTransfer  common.SnakedCell[TVM2AnyTokenTransfer] `tlb:"^"`
	FeeToken       *address.Address                        `tlb:"addr"`
	FeeTokenAmount *tlb.Coins                              `tlb:"."`
}

// TVM2AnyRampMessageV1 is the legacy (pre token-transfer-wrapper) shape of the OnRamp's
// CCIPMessageSent event message, kept only to decode already-emitted historical logs.
type TVM2AnyRampMessageV1 struct {
	Header        RampMessageHeader        `tlb:"."`
	Sender        *address.Address         `tlb:"addr"`
	Body          TVM2AnyRampMessageBodyV1 `tlb:"^"`
	FeeValueJuels *big.Int                 `tlb:"## 96"`
}

// TVM2AnyRampMessageBodyV1 is the legacy CCIPMessageSent body: the fourth body reference
// is tokenAmounts directly, with no sourcePoolAddress/post-fee-amount/destTokenAddress/
// extraData/destExecData wrapper.
type TVM2AnyRampMessageBodyV1 struct {
	Receiver       common.CrossChainAddress       `tlb:"^"`
	Data           common.SnakeBytes              `tlb:"^"`
	ExtraArgs      *cell.Cell                     `tlb:"^"`
	TokenAmounts   common.SnakedCell[TokenAmount] `tlb:"^"`
	FeeToken       *address.Address               `tlb:"addr"`
	FeeTokenAmount *tlb.Coins                     `tlb:"."`
}

// TVM2AnyTokenTransfer mirrors the contract's TVM2AnyTokenTransfer, the TON counterpart
// of SVM2AnyTokenTransfer / EVM2AnyTokenTransfer. The current TVM2Any flow supports a
// single token transfer, so TVM2AnyRampMessageBody.TokenTransfer is empty when the
// message carries no token transfer, or a one-item SnakedCell[TVM2AnyTokenTransfer] when
// it does.
type TVM2AnyTokenTransfer struct {
	// SourcePoolAddress is the TON pool the OnRamp routed the lockOrBurn to. Trusted:
	// the OnRamp sets it, not the pool. Only present when the message carries a token
	// transfer (see TVM2AnyRampMessageBody.TokenTransfer).
	SourcePoolAddress *address.Address `tlb:"addr"`
	// Amount is the post-fee cross-chain amount reported by the pool.
	Amount *big.Int `tlb:"## 256"`
	// DestTokenAddress is UNTRUSTED: any pool owner can return whatever value they want.
	DestTokenAddress common.CrossChainAddress `tlb:"^"`
	// ExtraData is the pool data forwarded to the destination chain
	// (LockOrBurnOutV1.destPoolData).
	ExtraData *cell.Cell `tlb:"^"`
	// DestExecData is the destination-chain execution data (gas for the offRamp's
	// releaseOrMint on EVM destinations).
	// TODO: always empty today; the FeeQuoter does not yet produce a per-token
	// destGasOverhead for token transfers.
	DestExecData *cell.Cell `tlb:"^"`
}

// TokenAmount mirrors the contract's common TokenAmount { amount: coins, token: address }.
type TokenAmount struct {
	Amount tlb.Coins        `tlb:"."`
	Token  *address.Address `tlb:"addr"`
}

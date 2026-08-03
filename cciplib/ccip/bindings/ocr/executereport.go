package ocr

import (
	"fmt"
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
	TokenTransfer  TVM2AnyTokenTransfer `tlb:"^"`
	FeeToken       *address.Address     `tlb:"addr"`
	FeeTokenAmount *tlb.Coins           `tlb:"."`
}

// LoadFromCell decodes both the current token-transfer wrapper and the legacy
// event layout, where tokenAmounts was the fourth body reference directly.
// The layouts have no version bit; the wrapper is distinguishable because it
// contains the tokenAmounts and destination-address references.
func (b *TVM2AnyRampMessageBody) LoadFromCell(s *cell.Slice) error {
	var err error
	if err := loadCellRef(s, &b.Receiver); err != nil {
		return fmt.Errorf("failed to load Receiver: %w", err)
	}
	dataCell, err := s.LoadRefCell()
	if err != nil {
		return fmt.Errorf("failed to load Data: %w", err)
	}
	if err := b.Data.LoadFromCell(dataCell.BeginParse()); err != nil {
		return fmt.Errorf("failed to decode Data: %w", err)
	}
	if b.ExtraArgs, err = s.LoadRefCell(); err != nil {
		return fmt.Errorf("failed to load ExtraArgs: %w", err)
	}

	transferCell, err := s.LoadRefCell()
	if err != nil {
		return fmt.Errorf("failed to load token transfer: %w", err)
	}
	if transferCell.RefsNum() >= 2 {
		if err := tlb.LoadFromCell(&b.TokenTransfer, transferCell.BeginParse()); err != nil {
			return fmt.Errorf("failed to load token transfer: %w", err)
		}
	} else {
		// Legacy CCIPMessageSent: the fourth ref is tokenAmounts directly.
		if err := tlb.LoadFromCell(&b.TokenTransfer.TokenAmounts, transferCell.BeginParse()); err != nil {
			return fmt.Errorf("failed to load legacy token amounts: %w", err)
		}
	}

	if b.FeeToken, err = s.LoadAddr(); err != nil {
		return fmt.Errorf("failed to load FeeToken: %w", err)
	}
	var feeTokenAmount tlb.Coins
	if err := tlb.LoadFromCell(&feeTokenAmount, s); err != nil {
		return fmt.Errorf("failed to load FeeTokenAmount: %w", err)
	}
	b.FeeTokenAmount = &feeTokenAmount
	return nil
}

func loadCellRef(s *cell.Slice, dst *common.CrossChainAddress) error {
	ref, err := s.LoadRefCell()
	if err != nil {
		return err
	}
	return dst.LoadFromCell(ref.BeginParse())
}

// TVM2AnyTokenTransfer mirrors the contract's TVM2AnyTokenTransfer: the source token
// amount(s) and the destination-chain token address returned by the pool's lockOrBurn.
// DestTokenAddress is empty when the message carries no token transfer.
type TVM2AnyTokenTransfer struct {
	TokenAmounts     common.SnakedCell[TokenAmount] `tlb:"^"`
	DestTokenAddress common.CrossChainAddress       `tlb:"^"`
}

// TokenAmount mirrors the contract's common TokenAmount { amount: coins, token: address }.
type TokenAmount struct {
	Amount tlb.Coins        `tlb:"."`
	Token  *address.Address `tlb:"addr"`
}

package chainaccessor

import (
	"github.com/smartcontractkit/chainlink-ccip/pkg/chainaccessor"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	cciptypes "github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

// TODO: remove, cherrypicked
// type CCIPMessageSent struct {
// 	DestChainSelector uint64   `tlb:"## 64"`
// 	SequenceNumber    uint64   `tlb:"## 64"`
// 	Message           CCIPSend `tlb:"^"`
// }

// type CCIPSend struct {
// 	_                 tlb.Magic                    `tlb:"#00000001"` //nolint:revive // Ignore opcode tag
// 	QueryID           uint64                       `tlb:"## 64"`
// 	DestChainSelector uint64                       `tlb:"## 64"`
// 	Receiver          common.CrossChainAddress     `tlb:"^"`
// 	Data              common.SnakeBytes            `tlb:"^"`
// 	TokenAmounts      common.SnakeRef[TokenAmount] `tlb:"^"`
// 	FeeToken          *address.Address             `tlb:"addr"`
// 	ExtraArgs         *cell.Cell                   `tlb:"^"`
// }

// type TokenAmount struct {
// 	Amount *big.Int        `tlb:"## 256"`
// 	Token  address.Address `tlb:"addr"`
// }

// ToGenericSendRequestedEvent converts a TON CCIPSend message to a generic CCIP message
func ToGenericSendRequestedEvent(
	tonEvent *onramp.CCIPMessageSent, // TODO: use rounter.CCIPSend once https://github.com/smartcontractkit/chainlink-ton/pull/76 is merged
	srcChainSelector ccipocr3.ChainSelector,
) (*chainaccessor.SendRequestedEvent, error) {
	// data, err := tonEvent.Message.Data.ToCell()
	// if err != nil {
	// 	return nil, fmt.Errorf("failed to convert data to BOC: %w", err)
	// }

	// create the generic CCIP message
	msg := ccipocr3.Message{
		Header: ccipocr3.RampMessageHeader{
			// MessageID:           tonEvent.Message.Header.MessageID,
			SourceChainSelector: srcChainSelector,
			DestChainSelector:   cciptypes.ChainSelector(tonEvent.DestChainSelector),
			SequenceNumber:      cciptypes.SeqNum(tonEvent.SequenceNumber),
			Nonce:               0, // TODO: Extract nonce if available in CCIPSend
		},
		Sender: ccipocr3.UnknownAddress{}, // TODO: Extract sender once available in CCIPSend
		// Data:           data.ToBOC(),
		Receiver:  ccipocr3.UnknownAddress(tonEvent.Message.Receiver),
		ExtraArgs: tonEvent.Message.ExtraArgs.ToBOC(),
		// FeeToken:       ccipocr3.UnknownAddress(tonEvent.Message.FeeToken.String()), // TODO: addr > byte?
		FeeTokenAmount: ccipocr3.BigInt{}, // TODO: Extract fee token amount once available in CCIPSend
		FeeValueJuels:  ccipocr3.BigInt{}, // TODO: Extract fee value in juels once available in CCIPSend
		// TokenAmounts:   tokenAmounts,
	}

	genericEvent := &chainaccessor.SendRequestedEvent{
		DestChainSelector: cciptypes.ChainSelector(tonEvent.DestChainSelector),
		SequenceNumber:    cciptypes.SeqNum(tonEvent.SequenceNumber),
		Message:           msg,
	}

	return genericEvent, nil
}

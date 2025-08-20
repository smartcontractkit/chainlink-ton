package chainaccessor

import (
	"errors"

	"github.com/smartcontractkit/chainlink-ccip/pkg/chainaccessor"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

// convertCCIPMessageSent converts a TON CCIPMessageSent event to a generic chainaccessor.SendRequestedEvent event
func (a *TONAccessor) convertCCIPMessageSent(
	tonEvent *onramp.CCIPMessageSent,
) (*chainaccessor.SendRequestedEvent, error) {
	if a.chainSelector == 0 {
		return nil, errors.New("source chain selector cannot be zero")
	}

	msg := ccipocr3.Message{
		Header: ccipocr3.RampMessageHeader{
			MessageID:           ccipocr3.Bytes32(tonEvent.Message.Header.MessageID),
			SourceChainSelector: a.chainSelector,
			DestChainSelector:   ccipocr3.ChainSelector(tonEvent.Message.Header.DestChainSelector),
			SequenceNumber:      ccipocr3.SeqNum(tonEvent.Message.Header.SequenceNumber),
			Nonce:               tonEvent.Message.Header.Nonce,
		},
		Sender:         ccipocr3.UnknownAddress(tonEvent.Message.Sender.String()),
		Data:           ccipocr3.Bytes(tonEvent.Message.Body.Data),
		Receiver:       ccipocr3.UnknownAddress(tonEvent.Message.Body.Receiver),
		ExtraArgs:      tonEvent.Message.Body.ExtraArgs.ToBOC(),
		FeeToken:       ccipocr3.UnknownAddress(tonEvent.Message.Body.FeeToken.String()),
		FeeTokenAmount: ccipocr3.NewBigInt(tonEvent.Message.Body.FeeTokenAmount),
		// TokenAmounts:   tokenAmounts, // TODO: enable token transfer
	}
	genericEvent := &chainaccessor.SendRequestedEvent{
		DestChainSelector: msg.Header.DestChainSelector,
		SequenceNumber:    msg.Header.SequenceNumber,
		Message:           msg,
	}
	return genericEvent, nil
}

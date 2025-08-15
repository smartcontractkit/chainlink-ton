package chainaccessor

import (
	"github.com/smartcontractkit/chainlink-ccip/pkg/chainaccessor"
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	cciptypes "github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

// TODO: to util
// ToGenericSendRequestedEvent converts a TON CCIPSend message to a generic CCIP message
func ToGenericSendRequestedEvent(
	tonEvent *onramp.CCIPMessageSent, // TODO: use rounter.CCIPSend once https://github.com/smartcontractkit/chainlink-ton/pull/76 is merged
	srcChainSelector ccipocr3.ChainSelector,
) (*chainaccessor.SendRequestedEvent, error) {
	// create the generic CCIP message
	msg := ccipocr3.Message{
		Header: ccipocr3.RampMessageHeader{
			// MessageID:           messageID,
			SourceChainSelector: srcChainSelector,
			DestChainSelector:   cciptypes.ChainSelector(tonEvent.DestChainSelector),
			SequenceNumber:      cciptypes.SeqNum(tonEvent.SequenceNumber),
			Nonce:               0, // TODO: Extract nonce if available in CCIPSend
		},
		Sender:         ccipocr3.UnknownAddress{}, // TODO: Extract sender once available in CCIPSend
		Data:           ccipocr3.Bytes{},          // TODO: Extract data once available in CCIPSend https://github.com/smartcontractkit/chainlink-ton/pull/76
		Receiver:       ccipocr3.UnknownAddress(tonEvent.Message.Receiver),
		ExtraArgs:      tonEvent.Message.ExtraArgs.ToBOC(),
		FeeToken:       ccipocr3.UnknownAddress{}, // TODO: Extract fee token once available in CCIPSend
		FeeTokenAmount: ccipocr3.BigInt{},         // TODO: Extract fee token amount once available in CCIPSend
		FeeValueJuels:  ccipocr3.BigInt{},         // TODO: Extract fee value in juels once available in CCIPSend
		// TokenAmounts:   tokenAmounts,
	}

	genericEvent := &chainaccessor.SendRequestedEvent{
		DestChainSelector: cciptypes.ChainSelector(tonEvent.DestChainSelector),
		SequenceNumber:    cciptypes.SeqNum(tonEvent.SequenceNumber),
		Message:           msg,
	}

	return genericEvent, nil
}

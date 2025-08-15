package chainaccessor

import (
	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
)

// TODO: to util
// ToGenericCCIPMessage converts a TON CCIPSend message to a generic CCIP message
func ToGenericCCIPMessage(
	msg *onramp.CCIPSend, // TODO: use rounter.CCIPSend
	srcChainSelector ccipocr3.ChainSelector,
	destChainSelector ccipocr3.ChainSelector,
	sequenceNumber ccipocr3.SeqNum,
	onRampAddress ccipocr3.UnknownAddress,
	txHash string,
	addressCodec codec.AddressCodec,
) (ccipocr3.Message, error) {

	// create the generic CCIP message
	message := ccipocr3.Message{
		Header: ccipocr3.RampMessageHeader{
			// MessageID:           messageID,
			SourceChainSelector: srcChainSelector,
			DestChainSelector:   destChainSelector,
			SequenceNumber:      sequenceNumber,
			Nonce:               0, // TODO: Extract nonce if available in CCIPSend
			OnRamp:              onRampAddress,
			TxHash:              txHash,
			// TODO: MsgHash will be populated by the plugin using the MsgHasher interface
		},
		Sender:         ccipocr3.UnknownAddress{}, // TODO: Extract sender once available in CCIPSend
		Data:           ccipocr3.Bytes{},          // TODO: Extract data once available in CCIPSend https://github.com/smartcontractkit/chainlink-ton/pull/76
		Receiver:       ccipocr3.UnknownAddress(msg.Receiver),
		ExtraArgs:      msg.ExtraArgs.ToBOC(),
		FeeToken:       ccipocr3.UnknownAddress{}, // TODO: Extract fee token once available in CCIPSend
		FeeTokenAmount: ccipocr3.BigInt{},         // TODO: Extract fee token amount once available in CCIPSend
		FeeValueJuels:  ccipocr3.BigInt{},         // TODO: Extract fee value in juels once available in CCIPSend
		// TokenAmounts:   tokenAmounts,
	}

	return message, nil
}

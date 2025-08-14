package chainaccessor

import (
	"crypto/sha256"
	"fmt"

	"github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
)

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
	// TODO: generate MessageID from the event data
	messageID, err := generateMessageID(msg, srcChainSelector, destChainSelector, sequenceNumber)
	if err != nil {
		return ccipocr3.Message{}, fmt.Errorf("failed to generate message ID: %w", err)
	}

	// convert receiver address
	receiverBytes := []byte(msg.Receiver)

	// TODO: convert TokenAmounts

	// convert ExtraArgs to bytes
	extraArgsBytes := msg.ExtraArgs.ToBOC()

	// create the generic CCIP message
	message := ccipocr3.Message{
		Header: ccipocr3.RampMessageHeader{
			MessageID:           messageID,
			SourceChainSelector: srcChainSelector,
			DestChainSelector:   destChainSelector,
			SequenceNumber:      sequenceNumber,
			Nonce:               0, // TODO: Extract nonce if available in CCIPSend
			OnRamp:              onRampAddress,
			TxHash:              txHash,
			// TODO: MsgHash will be populated by the plugin using the MsgHasher interface
		},
		Sender:         ccipocr3.UnknownAddress{}, // TODO: Extract sender once available in CCIPSend
		Data:           ccipocr3.Bytes{},          // TODO: Extract data once available in CCIPSend
		Receiver:       receiverBytes,
		ExtraArgs:      extraArgsBytes,
		FeeToken:       ccipocr3.UnknownAddress{}, // TODO: Extract fee token once available in CCIPSend
		FeeTokenAmount: ccipocr3.BigInt{},         // TODO: Extract fee token amount once available in CCIPSend
		FeeValueJuels:  ccipocr3.BigInt{},         // TODO: Extract fee value in juels once available in CCIPSend
		// TokenAmounts:   tokenAmounts,
	}

	return message, nil
}

// TODO: do we have a canonical way to generate message IDs?
// generateMessageID creates a message ID from the event data
func generateMessageID(
	msg *onramp.CCIPSend,
	sourceChainSelector ccipocr3.ChainSelector,
	destChainSelector ccipocr3.ChainSelector,
	sequenceNumber ccipocr3.SeqNum) (ccipocr3.Bytes32, error) {
	// Create a hash from the key fields of the message
	h := sha256.New()

	// TODO: implement ID gen
	hash := h.Sum(nil)
	var messageID ccipocr3.Bytes32
	copy(messageID[:], hash)

	return messageID, nil
}

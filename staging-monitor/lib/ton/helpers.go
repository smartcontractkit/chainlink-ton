package ton

import (
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

// leftPadTo32 pads a byte slice to 32 bytes (left-padding with zeros)
// This is required for EVM addresses when sending to TON router
func leftPadTo32(in []byte) []byte {
	if len(in) >= 32 {
		return in
	}
	out := make([]byte, 32)
	copy(out[32-len(in):], in)
	return out
}

// extractFromCCIPMessageSent extracts sequence number and messageID from TON CCIPMessageSent event
func extractFromCCIPMessageSent(msg *tracetracking.ReceivedMessage) (uint64, string, error) {
	if msg == nil {
		return 0, "", errors.New("received message is nil")
	}

	var messagesToProcess []*tracetracking.ReceivedMessage
	messagesToProcess = append(messagesToProcess, msg)

	var lastMsg *tracetracking.ReceivedMessage

	// Traverse message tree to find the last successful outgoing internal message
	for len(messagesToProcess) > 0 {
		currentMsg := messagesToProcess[0]
		messagesToProcess = messagesToProcess[1:]

		if len(currentMsg.OutgoingInternalReceivedMessages) == 0 {
			continue
		}

		for _, outMsg := range currentMsg.OutgoingInternalReceivedMessages {
			if outMsg.ExitCode != 0 || !outMsg.Success {
				continue
			}

			messagesToProcess = append(messagesToProcess, outMsg)
			lastMsg = outMsg
		}
	}

	// Extract CCIPMessageSent from last outgoing external message
	if lastMsg == nil || len(lastMsg.OutgoingExternalMessages) == 0 {
		return 0, "", errors.New("no outgoing external messages found")
	}

	var event onramp.CCIPMessageSent
	err := tlb.LoadFromCell(&event, lastMsg.OutgoingExternalMessages[0].Body.BeginParse())
	if err != nil {
		return 0, "", fmt.Errorf("failed to parse CCIPMessageSent from cell: %w", err)
	}

	messageID := hex.EncodeToString(event.Message.Header.MessageID)
	return event.Message.Header.SequenceNumber, messageID, nil
}

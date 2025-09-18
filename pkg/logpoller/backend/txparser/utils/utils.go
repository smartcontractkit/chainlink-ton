package txparserutils

import (
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/event"
)

// ParseExtMsgOut returns body and event signature(topic) for an external out message.
func ParseExtMsgOut(msg *tlb.ExternalMessageOut) (sig uint32, body *cell.Cell, err error) {
	// for ExtMsgOut we use topic for event sig
	bucket := event.NewExtOutLogBucket(msg.DestAddr())
	topic, err := bucket.DecodeEventTopic()
	if err != nil {
		// decoding issue, don't panic
		return 0, nil, errors.New("failed to decode event topic")
	}

	return topic, msg.Payload(), nil
}

// ParseInternalMsg returns body and event signature(opcode) for an internal message.
// this function extracts opcode, and returns remaining body slice as a cell
func ParseInternalMsg(msg *tlb.InternalMessage) (sig uint32, body *cell.Cell, err error) {
	payload := msg.Payload()
	if payload == nil {
		return 0, nil, nil // no payload
	}

	// extract opcode and remaining body in separate operations to avoid state mutation
	opcode, remainingBody, err := extractOpcodeAndBody(payload)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to extract opcode and body: %w", err)
	}

	return opcode, remainingBody, nil
}

// extractOpcodeAndBody safely extracts the opcode and remaining body without mutating the original cell
func extractOpcodeAndBody(payload *cell.Cell) (opcode uint32, remainingBody *cell.Cell, err error) {
	// create a slice for reading without mutating the original
	payloadSlice := payload.BeginParse()

	// validate we have enough bits for opcode
	if payloadSlice.BitsLeft() < 32 {
		return 0, nil, fmt.Errorf("insufficient bits for opcode: %d bits available, 32 required", payloadSlice.BitsLeft())
	}

	// extract opcode (first 32 bits)
	opcode64, err := payloadSlice.LoadUInt(32)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to load opcode: %w", err)
	}
	opcode = uint32(opcode64) //nolint:gosec // LoadUInt(32) guarantees this fits in uint32

	// create a new cell from the remaining data after opcode
	if payloadSlice.BitsLeft() == 0 {
		// no remaining bits, create empty cell
		remainingBody = cell.BeginCell().EndCell()
	} else {
		// convert remaining data to cell
		remainingBody, err = payloadSlice.ToCell()
		if err != nil {
			return 0, nil, fmt.Errorf("failed to convert remaining body to cell: %w", err)
		}
	}

	return opcode, remainingBody, nil
}

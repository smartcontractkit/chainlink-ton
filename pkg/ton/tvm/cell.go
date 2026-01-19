package tvm

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

const BIT_LENGTH_OPCODE = 32

// ExtractOpcode extracts the opcode from the message body cell.
func ExtractOpcode(body *cell.Cell) (uint32, error) {
	if body == nil {
		return 0, nil
	}

	s := body.BeginParse()
	if s.BitsLeft() < BIT_LENGTH_OPCODE {
		return 0, nil
	}

	// extract opcode (first 32 bits)
	opcode, err := s.LoadUInt(BIT_LENGTH_OPCODE)
	if err != nil {
		return 0, fmt.Errorf("failed to load opcode: %w", err)
	}

	return uint32(opcode), nil //nolint:gosec // LoadUInt(32) fits in uint32
}

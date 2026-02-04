package tvm

import (
	"bytes"
	"fmt"

	"github.com/xssnick/tonutils-go/tvm/cell"
)

// EmptyCell is an empty TVM cell - BOC: "te6cckEBAQEAAgAAAEysuc0="
var EmptyCell = cell.BeginCell().EndCell()

const BitLenOpcode = 32

// ExtractOpcode extracts the opcode from the message body cell.
func ExtractOpcode(body *cell.Cell) (uint32, error) {
	if body == nil {
		return 0, nil
	}

	s := body.BeginParse()
	if s.BitsLeft() < BitLenOpcode {
		return 0, nil
	}

	// extract opcode (first 32 bits)
	opcode, err := s.LoadUInt(BitLenOpcode)
	if err != nil {
		return 0, fmt.Errorf("failed to load opcode: %w", err)
	}

	return uint32(opcode), nil //nolint:gosec // LoadUInt(32) fits in uint32
}

// CellEquals compares two cells for equality by comparing their hashes. It treats nil cells as equal.
func CellEquals(a, b *cell.Cell) bool {
	if a == nil && b == nil {
		return true
	}

	if a == nil || b == nil {
		return false
	}

	return bytes.Equal(a.ToBOC(), b.ToBOC())
}

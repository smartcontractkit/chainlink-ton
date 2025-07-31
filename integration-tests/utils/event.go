package utils

import (
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// ParseEventFromCell is a test utility that deserializes a generic event struct
// of type T from a given TVM cell. It simplifies test setup by handling
// nil checks and wrapping parsing errors for clearer test failure messages.
func ParseEventFromCell[T any](cell *cell.Cell) (T, error) {
	var event T
	if cell == nil {
		return event, errors.New("cell is nil")
	}
	err := tlb.LoadFromCell(&event, cell.BeginParse())
	if err != nil {
		return event, fmt.Errorf("failed to parse %T event: %w", event, err)
	}
	return event, nil
}

// ParseEventFromMsg is a test utility that extracts the body from an external
// message and parses it into a generic event struct of type T. It's a
// convenience wrapper around ParseEventFromCell for tests that work with
// full message structures.
func ParseEventFromMsg[T any](msg *tlb.ExternalMessageOut) (T, error) {
	var event T
	if msg.Body == nil {
		return event, errors.New("message body is nil")
	}
	return ParseEventFromCell[T](msg.Body)
}

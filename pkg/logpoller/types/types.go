package types

import (
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type TxHash [32]byte

// LogParser is a function type responsible for parsing the raw log data (a TVM Cell)
// into a specific, strongly-typed Go struct.
//
// The parser takes a *cell.Cell, which represents the root cell of the log's message body,
// and should return the parsed event as an `any` type.
//
// If the cell cannot be parsed into the target struct (e.g., due to a malformed
// payload or a type mismatch), the function should return a non-nil error. The
// LogPoller will then skip that log and continue to the next one.
type LogParser func(c *cell.Cell) (any, error)

// LogFilter is a function type that is applied to a successfully parsed log event.
// It acts as a predicate to determine if the event should be included in the
// final query result set.
//
// The filter receives the parsed event (as an `any` type) returned by a LogParser.
// The implementation must first perform a type assertion to convert the `any` interface
// back to the expected concrete struct type.
//
// It should return `true` if the event matches the desired criteria and should be
// included in the results, or `false` to discard it.
type LogFilter func(parsedEvent any) bool

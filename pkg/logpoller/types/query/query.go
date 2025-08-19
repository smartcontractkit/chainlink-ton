package query

import (
	"bytes"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

// Operator defines comparison operators for byte-level filtering.
type Operator string

const (
	EQ  Operator = "="
	NEQ Operator = "!="
	GT  Operator = ">"
	GTE Operator = ">="
	LT  Operator = "<"
	LTE Operator = "<="
)

// SortOrder defines the sort direction.
type SortOrder string

const (
	ASC  SortOrder = "ASC"
	DESC SortOrder = "DESC"
)

// SortField defines the available fields for sorting.
type SortField string

const (
	SortByTxLT SortField = "tx_lt"
)

// TODO: bit-level filter feasibility check
// CellFilter defines a query for direct byte-level filtering on a log's cell data.
// This supports filtering on byte-aligned data structures commonly found in TON events,
// such as 32-bit integers, TON addresses (36 bytes), and other structured data.
type CellFilter struct {
	Offset   uint     // byte offset within the cell data (0-based)
	Operator Operator // comparison operator (e.g., "=", "!=", ">", "<")
	Value    []byte   // expected value for comparison
}

// Matches checks if payload matches a single byte filter
func (f *CellFilter) Matches(payload []byte) bool {
	// check if we have enough bytes
	end := f.Offset + uint(len(f.Value))
	if end > uint(len(payload)) {
		return false
	}

	dataSlice := payload[f.Offset:end]

	// apply comparison operator
	switch f.Operator {
	case EQ:
		return bytes.Equal(dataSlice, f.Value)
	case NEQ:
		return !bytes.Equal(dataSlice, f.Value)
	case GT:
		return bytes.Compare(dataSlice, f.Value) > 0
	case GTE:
		return bytes.Compare(dataSlice, f.Value) >= 0
	case LT:
		return bytes.Compare(dataSlice, f.Value) < 0
	case LTE:
		return bytes.Compare(dataSlice, f.Value) <= 0
	default:
		return false
	}
}

// SortBy defines sorting criteria for query results.
type SortBy struct {
	Field SortField
	Order SortOrder
}

// Options specifies pagination and sorting for log queries.
type Options struct {
	Limit  int
	Offset int
	SortBy []SortBy
}

// Result provides a unified return type for all query methods.
// It contains parsed logs with pagination metadata.
type Result[T any] struct {
	Logs    []types.TypedLog[T]
	HasMore bool
	Total   int
	Offset  int
	Limit   int
}

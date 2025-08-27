package query

import (
	"bytes"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

// operator defines comparison operators for byte-level filtering.
type operator int

const (
	opEQ operator = iota
	opNEQ
	opGT
	opGTE
	opLT
	opLTE
)

// Condition represents a single comparison to be applied to a slice of bytes.
// It is created via helper functions like EQ, GT, etc.
type Condition struct {
	Operator operator
	Value    []byte
}

// EQ creates a condition for an equality check (==).
func EQ(val []byte) Condition {
	return Condition{Operator: opEQ, Value: val}
}

// NEQ creates a condition for a non-equality check (!=).
func NEQ(val []byte) Condition {
	return Condition{Operator: opNEQ, Value: val}
}

// GT creates a condition for a greater-than check (>).
func GT(val []byte) Condition {
	return Condition{Operator: opGT, Value: val}
}

// GTE creates a condition for a greater-than-or-equal check (>=).
func GTE(val []byte) Condition {
	return Condition{Operator: opGTE, Value: val}
}

// LT creates a condition for a less-than check (<).
func LT(val []byte) Condition {
	return Condition{Operator: opLT, Value: val}
}

// LTE creates a condition for a less-than-or-equal check (<=).
func LTE(val []byte) Condition {
	return Condition{Operator: opLTE, Value: val}
}

// ByteFilter defines a query for direct byte-level filtering on a log's cell data.
// This is an internal struct created by the QueryBuilder.
type ByteFilter struct {
	Offset     uint // byte offset within the cell data (0-based)
	Size       uint
	Conditions []Condition
}

// Matches checks if payload matches a single byte filter
func (f *ByteFilter) Matches(payload []byte) bool {
	// check if we have enough bytes
	end := f.Offset + f.Size
	if end > uint(len(payload)) {
		return false
	}

	dataSlice := payload[f.Offset:end]

	for _, cond := range f.Conditions {
		// apply comparison operator
		var matches bool
		switch cond.Operator {
		case opEQ:
			matches = bytes.Equal(dataSlice, cond.Value)
		case opNEQ:
			matches = !bytes.Equal(dataSlice, cond.Value)
		case opGT:
			matches = bytes.Compare(dataSlice, cond.Value) > 0
		case opGTE:
			matches = bytes.Compare(dataSlice, cond.Value) >= 0
		case opLT:
			matches = bytes.Compare(dataSlice, cond.Value) < 0
		case opLTE:
			matches = bytes.Compare(dataSlice, cond.Value) <= 0
		default:
			matches = false
		}
		if !matches {
			return false
		}
	}
	return true
}

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

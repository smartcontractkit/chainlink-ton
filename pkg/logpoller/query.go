package logpoller

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/query"
)

var _ QueryBuilder[any] = (*queryBuilder[any])(nil)

// queryBuilder provides a fluent interface for constructing log queries with two-phase filtering.
// Phase 1: stored cell-level filtering at the storage layer
// Phase 2: Strongly-typed filtering on parsed events in the application layer
type queryBuilder[T any] struct {
	store       LogStore
	address     *address.Address
	eventSig    uint32
	cellFilters []query.CellFilter
	typedFilter func(T) bool
	options     query.Options
}

// NewQuery creates a new query builder for a specific event type.
func NewQuery[T any](store LogStore) QueryBuilder[T] {
	return &queryBuilder[T]{
		store:       store,
		cellFilters: make([]query.CellFilter, 0),
		options:     query.Options{},
	}
}

// WithSrcAddress sets the source address for the query.
func (b *queryBuilder[T]) WithSrcAddress(address *address.Address) QueryBuilder[T] {
	b.address = address
	return b
}

// WithEventSig sets the event signature for the query.
// TODO: support both event signature from ExtMsgOut and opcode from internal message
func (b *queryBuilder[T]) WithEventSig(sig uint32) QueryBuilder[T] {
	b.eventSig = sig
	return b
}

// WithCellFilter adds a raw cell-level filter
func (b *queryBuilder[T]) WithCellFilter(filter query.CellFilter) QueryBuilder[T] {
	b.cellFilters = append(b.cellFilters, filter)
	return b
}

// WithTypedFilter sets a strongly-typed in-memory filter
func (b *queryBuilder[T]) WithTypedFilter(filter func(T) bool) QueryBuilder[T] {
	b.typedFilter = filter
	return b
}

// WithLimit sets the maximum number of results to return.
func (b *queryBuilder[T]) WithLimit(limit int) QueryBuilder[T] {
	b.options.Limit = limit
	return b
}

// WithOffset sets the number of results to skip.
func (b *queryBuilder[T]) WithOffset(offset int) QueryBuilder[T] {
	b.options.Offset = offset
	return b
}

// WithSort adds sorting criteria to the query.
func (b *queryBuilder[T]) WithSort(field query.SortField, order query.SortOrder) QueryBuilder[T] {
	b.options.SortBy = append(b.options.SortBy, query.SortBy{
		Field: field,
		Order: order,
	})
	return b
}

// Execute runs the constructed query with two-phase filtering.
func (b *queryBuilder[T]) Execute(_ context.Context) (query.Result[T], error) {
	if b.address == nil {
		return query.Result[T]{}, errors.New("address is required")
	}

	if b.eventSig == 0 {
		return query.Result[T]{}, errors.New("event signature is required")
	}

	// Get all logs from store first
	logs, err := b.store.GetLogs(b.address, b.eventSig)
	if err != nil {
		return query.Result[T]{}, fmt.Errorf("failed to get logs from store: %w", err)
	}

	var preFilteredLogs []types.Log
	if len(b.cellFilters) > 0 {
		// TODO: prefilter in ORM layer
		for _, log := range logs {
			if b.passesAllCellFilters(log) {
				preFilteredLogs = append(preFilteredLogs, log)
			}
		}
	} else {
		preFilteredLogs = logs
	}

	var filteredParsedLogs []types.ParsedLog[T]
	for _, log := range preFilteredLogs {
		var event T
		parseErr := tlb.LoadFromCell(&event, log.Data.BeginParse(), true) // skip magic all the time
		if parseErr != nil {
			return query.Result[T]{}, fmt.Errorf("failed to parse log cell: %w", parseErr)
		}

		// Apply typed filter if specified
		if b.typedFilter == nil || b.typedFilter(event) {
			filteredParsedLogs = append(filteredParsedLogs, types.ParsedLog[T]{
				Log:        log,
				ParsedData: event,
			})
		}
	}

	// Apply sorting if specified
	if len(b.options.SortBy) > 0 {
		b.applySorting(filteredParsedLogs)
	}

	// Apply pagination
	start, end := b.calculatePagination(len(filteredParsedLogs))

	if start >= len(filteredParsedLogs) {
		return query.Result[T]{
			Logs:    []types.ParsedLog[T]{},
			HasMore: false,
			Total:   len(filteredParsedLogs),
			Offset:  b.options.Offset,
			Limit:   b.options.Limit,
		}, nil
	}

	pagedParsedLogs := filteredParsedLogs[start:end]

	return query.Result[T]{
		Logs:    pagedParsedLogs,
		HasMore: end < len(filteredParsedLogs),
		Total:   len(filteredParsedLogs),
		Offset:  b.options.Offset,
		Limit:   b.options.Limit,
	}, nil
}

// passesAllCellFilters checks if a log passes all byte-level filters
func (b *queryBuilder[T]) passesAllCellFilters(log types.Log) bool {
	if len(b.cellFilters) == 0 {
		return true
	}

	// Extract cell payload as bytes for byte-level filtering
	_, cellPayload, err := log.Data.BeginParse().RestBits()
	if err != nil {
		return false
	}

	// Check each filter
	for _, filter := range b.cellFilters {
		if !b.passesCellFilter(cellPayload, filter) {
			return false
		}
	}
	return true
}

// passesCellFilter checks if payload passes a single byte filter
func (b *queryBuilder[T]) passesCellFilter(payload []byte, filter query.CellFilter) bool {
	// Check payload length
	if uint(len(payload)) < filter.Offset+uint(len(filter.Value)) {
		return false
	}

	// Extract data slice
	end := filter.Offset + uint(len(filter.Value))
	if end > uint(len(payload)) {
		return false
	}

	dataSlice := payload[filter.Offset:end]

	// Apply comparison operator
	switch filter.Operator {
	case query.EQ:
		return bytesEqual(dataSlice, filter.Value)
	case query.NEQ:
		return !bytesEqual(dataSlice, filter.Value)
	case query.GT:
		return bytesGreater(dataSlice, filter.Value)
	case query.GTE:
		return bytesGreater(dataSlice, filter.Value) || bytesEqual(dataSlice, filter.Value)
	case query.LT:
		return bytesLess(dataSlice, filter.Value)
	case query.LTE:
		return bytesLess(dataSlice, filter.Value) || bytesEqual(dataSlice, filter.Value)
	default:
		return false
	}
}

// applySorting sorts parsed logs according to the specified criteria
func (b *queryBuilder[T]) applySorting(parsedLogs []types.ParsedLog[T]) {
	if len(b.options.SortBy) == 0 {
		return
	}

	sort.Slice(parsedLogs, func(i, j int) bool {
		for _, sortCriteria := range b.options.SortBy {
			var cmp int

			if sortCriteria.Field == query.SortByTxLT {
				if parsedLogs[i].Log.TxLT < parsedLogs[j].Log.TxLT {
					cmp = -1
				} else if parsedLogs[i].Log.TxLT > parsedLogs[j].Log.TxLT {
					cmp = 1
				}
			}

			if cmp != 0 {
				if sortCriteria.Order == query.DESC {
					return cmp > 0
				}
				return cmp < 0
			}
		}
		return false
	})
}

// calculatePagination calculates start and end indices for pagination
func (b *queryBuilder[T]) calculatePagination(totalCount int) (start, end int) {
	start = 0
	end = totalCount

	if b.options.Offset > 0 {
		start = b.options.Offset
		if start > totalCount {
			start = totalCount
		}
	}

	if b.options.Limit > 0 {
		limit := b.options.Limit
		if start+limit < end {
			end = start + limit
		}
	}

	return start, end
}

// Helper functions for byte comparison
func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func bytesGreater(a, b []byte) bool {
	minLen := len(a)
	if len(b) < minLen {
		minLen = len(b)
	}

	for i := 0; i < minLen; i++ {
		if a[i] > b[i] {
			return true
		} else if a[i] < b[i] {
			return false
		}
	}
	return len(a) > len(b)
}

func bytesLess(a, b []byte) bool {
	minLen := len(a)
	if len(b) < minLen {
		minLen = len(b)
	}

	for i := 0; i < minLen; i++ {
		if a[i] < b[i] {
			return true
		} else if a[i] > b[i] {
			return false
		}
	}
	return len(a) < len(b)
}

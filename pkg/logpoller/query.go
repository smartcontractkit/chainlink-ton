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
	address     *address.Address
	eventSig    uint32
	byteFilters []query.ByteFilter
	byteCursor  uint
	typedFilter func(T) bool
	options     query.Options
}

// NewQuery creates a new query builder for constructing log queries with two-phase filtering.
// It initializes a query builder for a specific event type T with the given source address and event signature.
//
// Parameters:
//   - srcAddress: The source contract address to filter logs by (required).
//     This specifies which contract's logs to search through.
//   - eventSig: The event signature (topic or opcode) to filter logs by (required).
//     This identifies the specific type of event/message to look for in the logs.
//
// Returns a QueryBuilder[T] that can be further configured with additional filters,
// sorting, and pagination options before execution.
func NewQuery[T any]() QueryBuilder[T] {
	return &queryBuilder[T]{
		byteFilters: make([]query.ByteFilter, 0),
		options:     query.Options{},
	}
}

// WithSource sets the TON contract address to filter logs by.
func (b *queryBuilder[T]) WithSource(addr *address.Address) QueryBuilder[T] {
	b.address = addr
	return b
}

// WithEventSig sets the event signature (topic or opcode) to filter logs by.
func (b *queryBuilder[T]) WithEventSig(sig uint32) QueryBuilder[T] {
	b.eventSig = sig
	return b
}

// SkipBytes advances the internal byte cursor, ignoring a specified number of bytes.
func (b *queryBuilder[T]) SkipBytes(bytes uint) QueryBuilder[T] {
	b.byteCursor += bytes
	return b
}

// FilterBytes applies conditions to the next `sizeInBytes` at the current cursor position,
// then advances the cursor.
func (b *queryBuilder[T]) FilterBytes(sizeInBytes uint, conditions ...query.Condition) QueryBuilder[T] {
	b.byteFilters = append(b.byteFilters, query.ByteFilter{
		Offset:     b.byteCursor,
		Size:       sizeInBytes,
		Conditions: conditions,
	})
	b.byteCursor += sizeInBytes
	return b
}

// FilterTyped adds a high-level filter function that operates on the parsed event data.
func (b *queryBuilder[T]) FilterTyped(filter func(T) bool) QueryBuilder[T] {
	b.typedFilter = filter
	return b
}

// Limit sets the maximum number of results to return.
func (b *queryBuilder[T]) Limit(limit int) QueryBuilder[T] {
	b.options.Limit = limit
	return b
}

// Offset sets the number of results to skip from the beginning.
func (b *queryBuilder[T]) Offset(offset int) QueryBuilder[T] {
	b.options.Offset = offset
	return b
}

// OrderBy specifies the sorting order for the results.
func (b *queryBuilder[T]) OrderBy(field query.SortField, order query.SortOrder) QueryBuilder[T] {
	b.options.SortBy = append(b.options.SortBy, query.SortBy{
		Field: field,
		Order: order,
	})
	return b
}

// Execute runs the constructed query with two-phase filtering.
func (b *queryBuilder[T]) Execute(_ context.Context, store LogStore) (query.Result[T], error) {
	if b.address == nil {
		return query.Result[T]{}, errors.New("address is required")
	}

	if b.eventSig == 0 {
		return query.Result[T]{}, errors.New("event signature is required")
	}

	// Get all logs from store first
	logs, err := store.GetLogs(b.address, b.eventSig)
	if err != nil {
		return query.Result[T]{}, fmt.Errorf("failed to get logs from store: %w", err)
	}

	// TODO: prefilter in ORM layer
	var preFilteredLogs []types.Log
	if len(b.byteFilters) > 0 {
		for _, log := range logs {
			if b.passesAllByteFilters(log) {
				preFilteredLogs = append(preFilteredLogs, log)
			}
		}
	} else {
		preFilteredLogs = logs
	}

	var filteredParsedLogs []types.TypedLog[T]
	for _, log := range preFilteredLogs {
		var event T
		// always skip magic(opcode in msg) when parsing log cells, we only store message body
		const skipMagic = true
		parseErr := tlb.LoadFromCell(&event, log.Data.BeginParse(), skipMagic)
		if parseErr != nil {
			return query.Result[T]{}, fmt.Errorf("failed to parse log cell: %w", parseErr)
		}

		// Apply typed filter if specified
		if b.typedFilter == nil || b.typedFilter(event) {
			filteredParsedLogs = append(filteredParsedLogs, types.TypedLog[T]{
				Log:       log,
				TypedData: event,
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
			Logs:    []types.TypedLog[T]{},
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

// passesAllByteFilters checks if a log passes all byte-level filters
func (b *queryBuilder[T]) passesAllByteFilters(log types.Log) bool {
	if len(b.byteFilters) == 0 {
		return true
	}

	// extract cell payload as bytes for byte-level filtering
	_, cellPayload, err := log.Data.BeginParse().RestBits()
	if err != nil {
		return false
	}

	// check each filter using the ByteFilter.Matches method
	for _, filter := range b.byteFilters {
		if !filter.Matches(cellPayload) {
			return false
		}
	}
	return true
}

// applySorting sorts parsed logs according to the specified criteria
func (b *queryBuilder[T]) applySorting(parsedLogs []types.TypedLog[T]) {
	if len(b.options.SortBy) == 0 {
		return
	}

	sort.Slice(parsedLogs, func(i, j int) bool {
		for _, sortCriteria := range b.options.SortBy {
			var cmp int

			if sortCriteria.Field == query.SortByTxLT {
				if parsedLogs[i].TxLT < parsedLogs[j].TxLT {
					cmp = -1
				} else if parsedLogs[i].TxLT > parsedLogs[j].TxLT {
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

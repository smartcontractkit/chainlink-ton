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
// Phase 1: byte-level filtering at the storage layer
// Phase 2: Strongly-typed filtering on parsed events in the application layer
type queryBuilder[T any] struct {
	store       LogStore
	address     *address.Address
	topic       uint32
	byteFilters []query.ByteFilter
	typedFilter func(T) bool
	options     query.Options
}

// NewQuery creates a new query builder for a specific event type.
func NewQuery[T any](store LogStore) QueryBuilder[T] {
	return &queryBuilder[T]{
		store:       store,
		byteFilters: make([]query.ByteFilter, 0),
		options:     query.Options{},
	}
}

// WithSrcAddress sets the source address for the query.
func (b *queryBuilder[T]) WithSrcAddress(address *address.Address) QueryBuilder[T] {
	b.address = address
	return b
}

// WithTopic sets the event topic for the query.
// TODO: support both event topic from ExtMsgOut and opcode from internal message
func (b *queryBuilder[T]) WithTopic(topic uint32) QueryBuilder[T] {
	b.topic = topic
	return b
}

// WithByteFilter adds a raw byte-level filter
func (b *queryBuilder[T]) WithByteFilter(filter query.ByteFilter) QueryBuilder[T] {
	b.byteFilters = append(b.byteFilters, filter)
	return b
}

// WithByteFilters adds multiple raw byte-level filters
func (b *queryBuilder[T]) WithByteFilters(filters []query.ByteFilter) QueryBuilder[T] {
	b.byteFilters = append(b.byteFilters, filters...)
	return b
}

// WithTypedFilter sets a strongly-typed in-memory filter
func (b *queryBuilder[T]) WithTypedFilter(filter func(T) bool) QueryBuilder[T] {
	b.typedFilter = filter
	return b
}

// WithOptions sets pagination and sorting options.
func (b *queryBuilder[T]) WithOptions(options query.Options) QueryBuilder[T] {
	b.options = options
	return b
}

// Execute runs the constructed query with two-phase filtering.
func (b *queryBuilder[T]) Execute(_ context.Context) (query.Result[T], error) {
	if b.address == nil {
		return query.Result[T]{}, errors.New("address is required")
	}

	if b.topic == 0 {
		return query.Result[T]{}, errors.New("topic is required")
	}

	// Get all logs from store first
	logs, err := b.store.GetLogs(b.address, b.topic)
	if err != nil {
		return query.Result[T]{}, fmt.Errorf("failed to get logs from store: %w", err)
	}

	var preFilteredLogs []types.Log
	if len(b.byteFilters) > 0 {
		// TODO: prefilter in ORM layer
		for _, log := range logs {
			if b.passesAllByteFilters(log) {
				preFilteredLogs = append(preFilteredLogs, log)
			}
		}
	} else {
		preFilteredLogs = logs
	}

	var filteredEvents []T
	var filteredLogs []types.Log
	for _, log := range preFilteredLogs {
		var event T
		parseErr := tlb.LoadFromCell(&event, log.Data.BeginParse())
		if parseErr != nil {
			return query.Result[T]{}, fmt.Errorf("failed to parse log cell: %w", parseErr)
		}

		// Apply typed filter if specified
		if b.typedFilter == nil || b.typedFilter(event) {
			filteredEvents = append(filteredEvents, event)
			filteredLogs = append(filteredLogs, log)
		}
	}

	// Apply sorting if specified
	if len(b.options.SortBy) > 0 {
		b.applySorting(filteredLogs, filteredEvents)
	}

	// Apply pagination
	start, end := b.calculatePagination(len(filteredEvents))

	if start >= len(filteredEvents) {
		return query.Result[T]{
			Logs:    []types.Log{},
			Events:  []T{},
			HasMore: false,
			Total:   len(filteredEvents),
			Offset:  b.options.Offset,
			Limit:   b.options.Limit,
		}, nil
	}

	pagedEvents := filteredEvents[start:end]
	pagedLogs := filteredLogs[start:end]

	return query.Result[T]{
		Logs:    pagedLogs,
		Events:  pagedEvents,
		HasMore: end < len(filteredEvents),
		Total:   len(filteredEvents),
		Offset:  b.options.Offset,
		Limit:   b.options.Limit,
	}, nil
}

// passesAllByteFilters checks if a log passes all byte-level filters
func (b *queryBuilder[T]) passesAllByteFilters(log types.Log) bool {
	if len(b.byteFilters) == 0 {
		return true
	}

	// Extract cell payload as bytes for byte-level filtering
	_, cellPayload, err := log.Data.BeginParse().RestBits()
	if err != nil {
		return false
	}

	// Check each filter
	for _, filter := range b.byteFilters {
		if !b.passesByteFilter(cellPayload, filter) {
			return false
		}
	}
	return true
}

// passesByteFilter checks if payload passes a single byte filter
func (b *queryBuilder[T]) passesByteFilter(payload []byte, filter query.ByteFilter) bool {
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

// applySorting sorts logs and events according to the specified criteria
func (b *queryBuilder[T]) applySorting(logs []types.Log, events []T) {
	if len(b.options.SortBy) == 0 {
		return
	}

	// Create index pairs to maintain log-event correspondence during sorting
	type indexPair struct {
		log   types.Log
		event T
		index int
	}

	pairs := make([]indexPair, len(logs))
	for i := range logs {
		pairs[i] = indexPair{log: logs[i], event: events[i], index: i}
	}

	sort.Slice(pairs, func(i, j int) bool {
		for _, sortCriteria := range b.options.SortBy {
			var cmp int

			if sortCriteria.Field == query.SortByTxLT {
				if pairs[i].log.TxLT < pairs[j].log.TxLT {
					cmp = -1
				} else if pairs[i].log.TxLT > pairs[j].log.TxLT {
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

	// Update the original slices with sorted data
	for i, pair := range pairs {
		logs[i] = pair.log
		events[i] = pair.event
	}
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

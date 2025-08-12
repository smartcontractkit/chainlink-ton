package logpoller

import (
	"context"
	"fmt"
	"sort"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/query"
)

var _ LogQuery[any] = (*logQuery[any])(nil)

// logQuery provides typed access to log data with different querying strategies.
// It automatically handles parsing for the specified event type T.
type logQuery[T any] struct {
	store LogStore
}

// NewLogQuery creates a new query instance for a specific event type.
// Parsing is handled automatically based on the type T.
func NewLogQuery[T any](store LogStore) LogQuery[T] {
	return &logQuery[T]{
		store: store,
	}
}

// query.WithRawByteFilter performs byte-level filtering to raw log data
func (q *logQuery[T]) WithRawByteFilter(
	_ context.Context,
	address *address.Address,
	topic uint32,
	filters []query.ByteFilter,
	options query.Options,
) (query.Result[T], error) {
	// Get raw logs from store
	logs, err := q.store.GetLogs(address, topic)
	if err != nil {
		return query.Result[T]{}, fmt.Errorf("failed to get logs from store: %w", err)
	}

	// Apply byte-level filtering
	var filteredLogs []types.Log
	for _, log := range logs {
		if q.passesAllFilters(log, filters) {
			filteredLogs = append(filteredLogs, log)
		}
	}

	// Apply sorting if specified
	if len(options.SortBy) > 0 {
		q.applySorting(filteredLogs, options.SortBy)
	}

	// Apply pagination
	start := 0
	totalCount := len(filteredLogs)

	if options.Offset > 0 {
		start = options.Offset
		if start > totalCount {
			start = totalCount
		}
	}

	end := totalCount
	if options.Limit > 0 && start+options.Limit < totalCount {
		end = start + options.Limit
	}

	// Get the paged logs
	var pagedLogs []types.Log
	if start < totalCount {
		pagedLogs = filteredLogs[start:end]
	}

	result := query.Result[T]{
		Logs:    pagedLogs,
		Events:  []T{}, // No parsing for raw byte filter
		HasMore: end < totalCount,
		Total:   totalCount,
		Offset:  options.Offset,
		Limit:   options.Limit,
	}

	return result, nil
}

// passesAllFilters checks if a log passes all byte-level filters
func (q *logQuery[T]) passesAllFilters(log types.Log, filters []query.ByteFilter) bool {
	if len(filters) == 0 {
		return true // no filters means all logs pass
	}

	// Extract cell payload as bytes for byte-level filtering
	_, cellPayload, err := log.Data.BeginParse().RestBits()
	if err != nil {
		return false // if we can't extract payload, filter fails
	}

	// Check each filter
	for _, filter := range filters {
		if !q.passesFilter(cellPayload, filter) {
			return false
		}
	}
	return true
}

// passesFilter checks if payload passes a single byte filter
func (q *logQuery[T]) passesFilter(payload []byte, filter query.ByteFilter) bool {
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

// applySorting sorts logs according to the specified criteria
func (q *logQuery[T]) applySorting(logs []types.Log, sortBy []query.SortBy) {
	if len(sortBy) == 0 {
		return
	}

	sort.Slice(logs, func(i, j int) bool {
		for _, sortCriteria := range sortBy {
			var cmp int

			if sortCriteria.Field == query.SortByTxLT {
				if logs[i].TxLT < logs[j].TxLT {
					cmp = -1
				} else if logs[i].TxLT > logs[j].TxLT {
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

// WithTypedFilter performs typed filtering after parsing all logs.
// This is more flexible but less efficient as it requires parsing all logs first.
// Use this for complex filtering logic that operates on parsed event fields.
func (q *logQuery[T]) WithTypedFilter(
	ctx context.Context,
	address *address.Address,
	topic uint32,
	filter func(T) bool,
	options query.Options,
) (query.Result[T], error) {
	// Get raw logs from store
	logs, err := q.store.GetLogs(address, topic)
	if err != nil {
		return query.Result[T]{}, fmt.Errorf("failed to get logs from store: %w", err)
	}

	// Parse all logs and apply typed filter
	var filteredEvents []T
	var filteredLogs []types.Log
	for _, log := range logs {
		var event T
		parseErr := tlb.LoadFromCell(&event, log.Data.BeginParse())
		if parseErr != nil {
			return query.Result[T]{}, fmt.Errorf("failed to parse log cell: %w", parseErr)
		}

		if filter == nil || filter(event) {
			filteredEvents = append(filteredEvents, event)
			filteredLogs = append(filteredLogs, log)
		}
	}

	// Apply sorting if specified
	if len(options.SortBy) > 0 {
		// Create a copy of events that we'll rearrange to match the sorted logs
		originalEvents := make([]T, len(filteredEvents))
		copy(originalEvents, filteredEvents)

		// Create index mapping before sorting
		indexMap := make(map[types.Log]int)
		for i, log := range filteredLogs {
			indexMap[log] = i
		}

		// Sort the logs using the existing method
		q.applySorting(filteredLogs, options.SortBy)

		// Reorder events to match the sorted logs
		for i, sortedLog := range filteredLogs {
			if originalIdx, exists := indexMap[sortedLog]; exists {
				filteredEvents[i] = originalEvents[originalIdx]
			}
		}
	}

	// Apply pagination to filtered results
	start := 0
	end := len(filteredEvents)

	if options.Offset > 0 {
		start = options.Offset
		if start > len(filteredEvents) {
			start = len(filteredEvents)
		}
	}

	if options.Limit > 0 {
		limit := options.Limit
		if start+limit < end {
			end = start + limit
		}
	}

	if start >= len(filteredEvents) {
		return query.Result[T]{
			Logs:    []types.Log{},
			Events:  []T{},
			HasMore: false,
			Total:   len(filteredEvents),
			Offset:  options.Offset,
			Limit:   options.Limit,
		}, nil
	}

	pagedEvents := filteredEvents[start:end]
	pagedLogs := make([]types.Log, 0)
	if start < len(filteredLogs) {
		endLogs := end
		if endLogs > len(filteredLogs) {
			endLogs = len(filteredLogs)
		}
		pagedLogs = filteredLogs[start:endLogs]
	}

	hasMore := end < len(filteredEvents)

	result := query.Result[T]{
		Logs:    pagedLogs,
		Events:  pagedEvents,
		HasMore: hasMore,
		Total:   len(filteredEvents),
		Offset:  options.Offset,
		Limit:   options.Limit,
	}

	return result, nil
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

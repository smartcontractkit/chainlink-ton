package query

import (
	"context"
	"errors"

	"github.com/xssnick/tonutils-go/address"

	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// Builder defines the interface for constructing and executing log queries.
type Builder interface {
	// WithSource sets the TON contract address to filter logs by (required for Execute)
	WithSource(addr *address.Address) *queryBuilder
	// WithEventSig sets the event signature (topic or opcode) to filter logs by (required for Execute)
	WithEventSig(sig uint32) *queryBuilder
	// WithFields adds field filters to the query (timestamp, block number, etc.)
	WithFields(filters ...*FieldFilter) *queryBuilder
	// WithBocBytes applies sequential byte-level filtering to the log's BOC data field
	WithBocBytes(scanners ...bocByteScanner) *queryBuilder
	// WithBocBits applies bit-level filtering to the log's BOC data field
	WithBocBits(scanners ...bocBitScanner) *queryBuilder
	// WithLimitAndSort sets the pagination and sorting options using chainlink-common standards
	WithLimitAndSort(limitAndSort commonquery.LimitAndSort) *queryBuilder
	// Execute runs the constructed query and returns filtered logs with pagination info.
	// Returns error if required filters (address, event_sig) are missing.
	Execute(ctx context.Context) (logs []models.Log, hasMore bool, nextCursor string, err error)
	// Query returns the constructed LogQuery for inspection or custom execution
	Query() *LogQuery
}

// LogStore defines the minimal interface needed by QueryBuilder to retrieve filtered logs.
// This avoids circular import by defining only what QueryBuilder needs.
type LogStore interface {
	QueryLogs(ctx context.Context, query *LogQuery) (logs []models.Log, hasMore bool, nextCursor string, err error)
}

// queryBuilder provides a fluent interface for constructing log queries.
// It performs field, byte, and bit-level filtering at the storage layer and returns raw results.
type queryBuilder struct {
	store LogStore
	query *LogQuery
}

// NewQueryBuilder creates a new query builder with the given store.
// This is the entry point for creating queries through the logpoller service.
func NewQueryBuilder(store LogStore) *queryBuilder {
	return &queryBuilder{
		store: store,
		query: &LogQuery{
			FieldFilters: []*FieldFilter{},
		},
	}
}

// WithSource sets the TON contract address to filter logs by.
func (b *queryBuilder) WithSource(addr *address.Address) *queryBuilder {
	addressFilter := &FieldFilter{
		Field:    "address",
		Operator: primitives.Eq,
		Value:    addr,
	}
	b.query.FieldFilters = append(b.query.FieldFilters, addressFilter)
	return b
}

// WithEventSig sets the event signature (topic or opcode) to filter logs by.
func (b *queryBuilder) WithEventSig(sig uint32) *queryBuilder {
	eventSigFilter := &FieldFilter{
		Field:    "event_sig",
		Operator: primitives.Eq,
		Value:    sig,
	}
	b.query.FieldFilters = append(b.query.FieldFilters, eventSigFilter)
	return b
}

// WithFields adds field filters to the query (timestamp, block number, etc.).
func (b *queryBuilder) WithFields(filters ...*FieldFilter) *queryBuilder {
	b.query.FieldFilters = append(b.query.FieldFilters, filters...)
	return b
}

// WithBocBytes applies sequential byte-level filtering to the log's BOC data field.
// BOC scanners are applied in order with a cursor that advances through the cell data.
func (b *queryBuilder) WithBocBytes(scanners ...bocByteScanner) *queryBuilder {
	cursor := uint64(0)
	for _, scanner := range scanners {
		cursor = scanner.Apply(b.query, cursor)
	}
	return b
}

// WithBocBits applies bit-level filtering to the log's BOC data field.
// BOC scanners are applied in order with a cursor that advances through the cell data.
func (b *queryBuilder) WithBocBits(scanners ...bocBitScanner) *queryBuilder {
	cursor := uint64(0)
	for _, scanner := range scanners {
		cursor = scanner.Apply(b.query, cursor)
	}
	return b
}

// WithLimitAndSort sets the pagination and sorting options using chainlink-common standards.
func (b *queryBuilder) WithLimitAndSort(limitAndSort commonquery.LimitAndSort) *queryBuilder {
	b.query.LimitAndSort = limitAndSort
	return b
}

// Query returns the constructed LogQuery.
func (b *queryBuilder) Query() *LogQuery {
	return b.query
}

// Execute runs the constructed query and returns raw results.
func (b *queryBuilder) Execute(ctx context.Context) ([]models.Log, bool, string, error) {
	if !validateFieldFilter(b.query.FieldFilters, "address") {
		return nil, false, "", errors.New("address is required")
	}

	if !validateFieldFilter(b.query.FieldFilters, "event_sig") {
		return nil, false, "", errors.New("event signature is required")
	}

	return b.store.QueryLogs(ctx, b.query)
}

// validateFieldFilter checks if a field filter exists for the given field name
func validateFieldFilter(filters []*FieldFilter, field string) bool {
	for _, filter := range filters {
		if filter.Field == field {
			return true
		}
	}
	return false
}

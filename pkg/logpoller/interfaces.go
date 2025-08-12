package logpoller

import (
	"context"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/services"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/query"
)

// Service defines the public interface for the TON log polling service.
type Service interface {
	services.Service
	RegisterFilter(ctx context.Context, flt types.Filter) error
	UnregisterFilter(ctx context.Context, name string) error
	HasFilter(ctx context.Context, name string) bool
	GetStore() LogStore
}

// MessageLoader defines the interface for loading external messages from the TON blockchain.
// It provides functionality to scan blockchain data and extract relevant messages from
// specified addresses within a given block range.
type MessageLoader interface {
	// LoadMessagesForAddresses scans the TON blockchain for external messages from specified
	// source addresses within a given block range.
	//
	// This method retrieves all external messages (ExternalMessageOut) that were emitted
	// by the provided source addresses between prevBlock (exclusive) and toBlock (inclusive).
	LoadMessagesForAddresses(ctx context.Context, srcAddrs []*address.Address, prevBlock, toBlock *ton.BlockIDExt) ([]types.IndexedMsg, error)
}

// FilterStore defines an interface for storing and retrieving log filter specifications.
type FilterStore interface {
	// RegisterFilter adds a new filter or overwrites an existing one with the same name.
	RegisterFilter(ctx context.Context, flt types.Filter) error
	// UnregisterFilter removes a filter by its unique name.
	UnregisterFilter(ctx context.Context, name string) error
	// HasFilter checks if a filter with the given name exists.
	HasFilter(ctx context.Context, name string) bool
	// GetDistinctAddresses returns a slice of unique addresses that are being monitored.
	GetDistinctAddresses() ([]*address.Address, error)
	// MatchingFilters returns all filter IDs that match a given contract address and event topic.
	MatchingFilters(contractAddr address.Address, topic uint32) []int64
}

// LogStore defines the interface for storing and retrieving logs.
type LogStore interface {
	SaveLog(log types.Log)
	// GetLogs retrieves raw logs for a given address and topic without any parsing or filtering.
	// This is a simple method that returns the raw cell data for further processing.
	GetLogs(srcAddr *address.Address, topic uint32) ([]types.Log, error)
}

// QueryBuilder defines the interface for constructing and executing log queries.
// The generic type T represents the expected event(msg) structure that logs will be parsed into.
type QueryBuilder[T any] interface {
	// WithSrcAddress sets the source contract address to filter logs by(required)
	WithSrcAddress(address *address.Address) QueryBuilder[T]

	// WithTopic sets the event topic (signature) to filter logs by (required)
	WithTopic(topic uint32) QueryBuilder[T]

	// WithByteFilter adds a single byte-level filter to the query.
	// Byte filters allow filtering based on raw byte comparisons at specific offsets
	// in the log data. Multiple byte filters can be added and they are combined with AND logic.
	WithByteFilter(filter query.ByteFilter) QueryBuilder[T]

	// WithTypedFilter adds a high-level filter function that operates on parsed event objects.
	// The filter function receives a parsed event of type T and returns true if the event
	// should be included in the results
	WithTypedFilter(filter func(T) bool) QueryBuilder[T]

	// WithOptions sets query execution options such as pagination (limit/offset).
	WithOptions(options query.Options) QueryBuilder[T]

	// Execute runs the constructed query and returns the results.
	Execute(ctx context.Context) (query.Result[T], error)
}

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
	// LoadMsgsFromSrcAddrs scans the TON blockchain for external messages from specified
	// source addresses within a given block range.
	//
	// This method retrieves all external messages (ExternalMessageOut) that were emitted
	// by the provided source addresses between prevBlock (exclusive) and toBlock (inclusive).
	LoadMsgsFromSrcAddrs(ctx context.Context, srcAddrs []*address.Address, prevBlock, toBlock *ton.BlockIDExt) ([]types.IndexedMsg, error)
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

// LogQuery defines the interface for querying logs with different filtering strategies.
type LogQuery[T any] interface {
	WithRawByteFilter(ctx context.Context, address *address.Address, topic uint32, filters []query.ByteFilter, options query.Options) (query.Result[T], error)
	WithTypedFilter(ctx context.Context, address *address.Address, topic uint32, filter func(T) bool, options query.Options) (query.Result[T], error)
}

package logpoller

import (
	"context"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/services"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/cellquery"
)

// LogPoller defines the public interface for the TON log polling service.
type LogPoller interface {
	services.Service
	RegisterFilter(ctx context.Context, flt types.Filter) error
	UnregisterFilter(ctx context.Context, name string) error
	HasFilter(ctx context.Context, name string) bool
	FilteredLogs(ctx context.Context, address *address.Address, topic uint32, queries []cellquery.CellQuery, options cellquery.QueryOptions) (cellquery.QueryResult, error)
	FilteredLogsWithParser(ctx context.Context, address *address.Address, topic uint32, parser types.LogParser, filter types.LogFilter) ([]any, error)
}

// MessageLoader defines the interface for loading external messages from the TON blockchain.
// It provides functionality to scan blockchain data and extract relevant messages from
// specified addresses within a given block range.
type MessageLoader interface {
	// BackfillForAddresses scans the TON blockchain for external messages from specified
	// source addresses within a given block range.
	//
	// This method retrieves all external messages (ExternalMessageOut) that were emitted
	// by the provided source addresses between prevBlock (exclusive) and toBlock (inclusive).
	BackfillForAddresses(ctx context.Context, srcAddrs []*address.Address, prevBlock, toBlock *ton.BlockIDExt) ([]types.IndexedMsg, error)
}

// FilterStore defines an interface for storing and retrieving log filter specifications.
type FilterStore interface {
	RegisterFilter(ctx context.Context, flt types.Filter) error         // RegisterFilter adds a new filter or overwrites an existing one with the same name.
	UnregisterFilter(ctx context.Context, name string) error            // UnregisterFilter removes a filter by its unique name.
	HasFilter(ctx context.Context, name string) bool                    // HasFilter checks if a filter with the given name exists.
	GetDistinctAddresses() ([]*address.Address, error)                  // GetDistinctAddresses returns a slice of unique addresses that are being monitored.
	MatchingFilters(contractAddr address.Address, topic uint32) []int64 // MatchingFilters returns all filter IDs that match a given contract address and event topic.
}

// LogStore defines the interface for storing and retrieving logs.
type LogStore interface {
	SaveLog(log types.Log)
	FilteredLogs(address string, topic uint32, queries []cellquery.CellQuery, options cellquery.QueryOptions) (cellquery.QueryResult, error)
	FilteredLogsWithParser(address string, topic uint32, parser types.LogParser, filter types.LogFilter) ([]any, error)
}

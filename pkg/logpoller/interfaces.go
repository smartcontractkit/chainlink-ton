package logpoller

import (
	"context"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/services"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/cellquery"
)

// LogParser is a function type responsible for parsing the raw log data (a TVM Cell)
// into a specific, strongly-typed Go struct.
//
// The parser takes a *cell.Cell, which represents the root cell of the log's message body,
// and should return the parsed event as an `any` type.
//
// If the cell cannot be parsed into the target struct (e.g., due to a malformed
// payload or a type mismatch), the function should return a non-nil error. The
// LogPoller will then skip that log and continue to the next one.
type LogParser func(c *cell.Cell) (any, error)

// LogFilter is a function type that is applied to a successfully parsed log event.
// It acts as a predicate to determine if the event should be included in the
// final query result set.
//
// The filter receives the parsed event (as an `any` type) returned by a LogParser.
// The implementation must first perform a type assertion to convert the `any` interface
// back to the expected concrete struct type.
//
// It should return `true` if the event matches the desired criteria and should be
// included in the results, or `false` to discard it.
type LogFilter func(parsedEvent any) bool

// LogPoller defines the public interface for the TON log polling service.
type LogPoller interface {
	services.Service
	RegisterFilter(ctx context.Context, flt types.Filter) error
	UnregisterFilter(ctx context.Context, name string) error
	HasFilter(ctx context.Context, name string) bool
	FilteredLogs(ctx context.Context, address *address.Address, topic uint32, queries []cellquery.CellQuery, options cellquery.QueryOptions) (cellquery.QueryResult, error)
	FilteredLogsWithParser(ctx context.Context, address *address.Address, topic uint32, parser LogParser, filter LogFilter) ([]any, error)
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
	FilteredLogs(address string, topic uint32, queries []cellquery.CellQuery, options cellquery.QueryOptions) (cellquery.QueryResult, error)
	FilteredLogsWithParser(address string, topic uint32, parser LogParser, filter LogFilter) ([]any, error)
}

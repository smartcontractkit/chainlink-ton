package logpoller

import (
	"context"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/services"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types/query"
)

// Service defines the public interface for the TON log polling service.
type Service interface {
	services.Service
	RegisterFilter(ctx context.Context, flt types.Filter) error
	UnregisterFilter(ctx context.Context, name string) error
	HasFilter(ctx context.Context, name string) (bool, error)
	GetStore() LogStore
}

// FilterStore defines an interface for storing and retrieving log filter specifications.
type FilterStore interface {
	// RegisterFilter adds a new filter or overwrites an existing one with the same name.
	RegisterFilter(ctx context.Context, flt types.Filter) error
	// UnregisterFilter removes a filter by its unique name.
	UnregisterFilter(ctx context.Context, name string) error
	// HasFilter checks if a filter with the given name exists.
	HasFilter(ctx context.Context, name string) (bool, error)
	// GetDistinctAddresses returns a slice of unique addresses that are being monitored.
	GetDistinctAddresses(ctx context.Context) ([]*address.Address, error)
	// GetFiltersForAddressAndMsgType returns filters for a specific address and message type.
	GetFiltersForAddressAndMsgType(ctx context.Context, addr *address.Address, msgType tlb.MsgType) ([]types.Filter, error)
}

// TxLoader defines the interface for loading transactions from the TON blockchain.
type TxLoader interface {
	LoadTxsForAddresses(ctx context.Context, blockRange *types.BlockRange, srcAddrs []*address.Address) ([]types.TxWithBlock, error)
}

type TxIndexer interface {
	IndexTransactions(ctx context.Context, txs []types.TxWithBlock) ([]types.Log, error)
}

// LogStore defines the interface for storing and retrieving logs.
type LogStore interface {
	SaveLog(log types.Log)
	// GetLogs retrieves raw logs for a given address and event signature without any parsing or filtering.
	// This is a simple method that returns the raw cell data for further processing.
	GetLogs(srcAddr *address.Address, sig uint32) ([]types.Log, error)
}

// QueryBuilder defines the interface for constructing and executing log queries.
// The generic type T represents the expected event(msg) structure that logs will be parsed into.
type QueryBuilder[T any] interface {
	// WithSrcAddress sets the source contract address to filter logs by(required)
	WithSrcAddress(address *address.Address) QueryBuilder[T]

	// WithEventSig sets the event sig(topic or opcode) to filter logs by (required)
	WithEventSig(sig uint32) QueryBuilder[T]

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

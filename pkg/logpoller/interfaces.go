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
	// LoadTxsForAddresses retrieves all transactions from the specified source addresses
	// within the given block range (prevBlock, toBlock] - exclusive of prevBlock, inclusive of toBlock.
	LoadTxsForAddresses(ctx context.Context, blockRange *types.BlockRange, srcAddrs []*address.Address) ([]types.TxWithBlock, error)
}

// TxParser defines the interface for parsing raw blockchain transactions into structured logs.
type TxParser interface {
	// It processes transactions by examining their messages, applying registered filters, and extracting
	// relevant event data. The parser handles different message types (internal, external out) and
	// extracts event signatures (opcodes for internal messages, topics for external out messages)
	// along with the message body data to create structured log entries.
	ParseTransactions(ctx context.Context, txs []types.TxWithBlock) ([]types.Log, error)
}

// LogStore defines the interface for storing and retrieving logs.
type LogStore interface {
	SaveLog(log types.Log)
	// GetLogs retrieves raw logs for a given address and event signature without any parsing or filtering.
	// This is a simple method that returns the raw cell data for further processing.
	GetLogs(srcAddr *address.Address, sig uint32) ([]types.Log, error)
}

// QueryBuilder defines the interface for constructing and executing log queries.
// The generic type T represents the expected event structure that logs will be parsed into.
type QueryBuilder[T any] interface {
	// WithSource sets the TON contract address to filter logs by.
	WithSource(addr *address.Address) QueryBuilder[T]

	// WithEventSig sets the event signature (topic or opcode) to filter logs by.
	WithEventSig(sig uint32) QueryBuilder[T]

	// --- Byte-Level Filtering ---
	// Methods for filtering logs based on raw byte patterns before parsing.

	// SkipBytes advances the internal byte cursor, ignoring a specified number of bytes.
	SkipBytes(bytes uint) QueryBuilder[T]

	// FilterBytes applies conditions to the next `sizeInBytes` at the current cursor position,
	// then advances the cursor.
	FilterBytes(sizeInBytes uint, conditions ...query.Condition) QueryBuilder[T]

	// --- Typed Filtering ---
	// Method for filtering logs after they have been parsed into the generic type T.

	// FilterTyped adds a high-level filter function that operates on the parsed event data.
	FilterTyped(filter func(T) bool) QueryBuilder[T]

	// --- Query Options ---
	// Methods for controlling pagination and sorting of the final result set.

	// Limit sets the maximum number of results to return.
	Limit(limit int) QueryBuilder[T]

	// Offset sets the number of results to skip from the beginning.
	Offset(offset int) QueryBuilder[T]

	// OrderBy specifies the sorting order for the results.
	OrderBy(field query.SortField, order query.SortOrder) QueryBuilder[T]

	// --- Execution ---

	// Execute runs the constructed query and returns the results.
	Execute(ctx context.Context, store LogStore) (query.Result[T], error)
}

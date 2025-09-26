package logpoller

import (
	"context"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-common/pkg/services"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
)

// Service defines the public interface for the TON log polling service.
type Service interface {
	services.Service
	RegisterFilter(ctx context.Context, flt models.Filter) (int64, error)
	UnregisterFilter(ctx context.Context, name string) error
	HasFilter(ctx context.Context, name string) (bool, error)
	Replay(ctx context.Context, fromBlock uint32) error
	NewQuery() query.Builder
}

// FilterStore defines an interface for storing and retrieving log filter specifications.
type FilterStore interface {
	// RegisterFilter adds a new filter or overwrites an existing one with the same name.
	// Returns the ID of the created filter.
	RegisterFilter(ctx context.Context, flt models.Filter) (int64, error)
	// UnregisterFilter removes a filter by its unique name.
	UnregisterFilter(ctx context.Context, name string) error
	// HasFilter checks if a filter with the given name exists.
	HasFilter(ctx context.Context, name string) (bool, error)
	// GetDistinctAddresses returns a slice of unique addresses that are being monitored.
	GetDistinctAddresses(ctx context.Context) ([]*address.Address, error)
	// GetFiltersByAddress returns all filters for a specific address.
	GetFiltersByAddress(ctx context.Context, addr *address.Address) ([]models.Filter, error)
}

// TxLoader defines the interface for loading transactions from the TON blockchain.
type TxLoader interface {
	// LoadTxsForAddress retrieves transactions for a specific address within a block range.
	// Returns parallel slices of transactions and their corresponding blocks.
	LoadTxsForAddress(ctx context.Context, blockRange *models.BlockRange, addr *address.Address) (<-chan models.Tx, <-chan error, error)
}

// Processor defines the interface for processing raw blockchain transactions into structured logs.
type Processor interface {
	// ProcessTransactions processes transactions by examining their messages and applying the provided
	// filter index to extract relevant event data. The processor handles different message types
	// (internal, external out) and extracts event signatures along with message body data.
	// Takes parallel slices of transactions and their corresponding blocks.
	ProcessTransactions(ctx context.Context, filterIndex models.FilterIndex, txs <-chan models.Tx) (<-chan models.Log, error)
}

// LogStore defines the interface for storing and retrieving logs.
type LogStore interface {
	SaveLogs(ctx context.Context, logs []models.Log) (int64, error)
	// QueryLogs retrieves logs with TON-specific filtering capabilities including byte-level filtering,
	// sorting, and pagination. This method handles all filtering, sorting, and pagination.
	// The LogStore is responsible for translating parameters to its optimal execution strategy.
	// Uses chainlink-common's LimitAndSort for standardized pagination and sorting.
	QueryLogs(ctx context.Context, query *query.LogQuery) (logs []models.Log, hasMore bool, nextCursor string, err error)
}

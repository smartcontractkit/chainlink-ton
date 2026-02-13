package logpoller

import (
	"context"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/services"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
)

// Service defines the public interface for the TON log polling service.
type Service interface {
	services.Service
	// RegisterFilter adds a new filter. Changes take effect on the next loop tick (up to pollPeriod delay).
	RegisterFilter(ctx context.Context, flt models.Filter) (int64, error)
	// UnregisterFilter removes a filter. Changes take effect on the next loop tick (up to pollPeriod delay).
	// If called during an active tick, the old filter continues processing for that tick.
	UnregisterFilter(ctx context.Context, name string) error
	HasFilter(ctx context.Context, name string) (bool, error)
	Replay(ctx context.Context, fromBlock uint32) error
	ReplayStatus() models.ReplayStatus
	NewQuery() query.Builder
}

// FilterStore defines an interface for storing and retrieving log filter specifications.
// Note: Filter changes at the store level are immediate, but the LogPoller service
// reads filters once per tick, so changes take effect on the next loop tick.
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
	// GetAllActiveFilters returns all non-deleted filters for the chain.
	// Used to populate filter cache on startup.
	GetAllActiveFilters(ctx context.Context) ([]models.Filter, error)
	// DeleteEmptyFilters removes filter rows that are marked is_deleted=true
	// and have no remaining logs in the logs table.
	// This is the final cleanup step after DeleteLogsForDeletedFilters has removed all logs.
	// Returns number of filter rows deleted.
	DeleteEmptyFilters(ctx context.Context) (int64, error)
}

// TxLoader defines the interface for loading transactions from the TON blockchain.
type TxLoader interface {
	// LoadTxsForAddress retrieves transactions for a specific address within a block range.
	// pageSize controls the number of transactions to fetch per TON API call for pagination.
	// Transactions and runtime errors are written to the provided channels synchronously.
	// Returns immediate validation/setup errors. The caller is responsible for spawning goroutines
	// and managing channel lifecycle.
	LoadTxsForAddress(ctx context.Context, blockRange *models.BlockRange, addr *address.Address, pageSize uint32, txOut chan<- models.Tx, errOut chan<- error) error

	// GetTxsForAddress is a convenience wrapper around LoadTxsForAddress that returns
	// transactions as a slice instead of streaming to a channel. This is suitable for
	// bounded result sets where memory is not a concern.
	// Use LoadTxsForAddress for streaming large result sets or when you need fine-grained
	// control over concurrent processing.
	//
	// Warning: Be cautious about memory pressure when querying large ranges of blocks.
	// For large ranges, consider using LoadTxsForAddress with streaming to process
	// transactions incrementally.
	GetTxsForAddress(ctx context.Context, blockRange *models.BlockRange, addr *address.Address, pageSize uint32) ([]models.Tx, error)
}

// LogStore defines the interface for storing and retrieving logs.
type LogStore interface {
	// SaveLogs saves logs to storage with configurable batching behavior(with transaction support in PostgreSQL).
	// batchInsertSize controls the maximum number of logs per database batch operation.
	// minBatchSize sets the minimum batch size for retry attempts on timeout errors.
	// Returns the number of logs successfully saved.
	SaveLogs(ctx context.Context, logs []models.Log, batchInsertSize, minBatchSize uint32) (int64, error)
	// QueryLogs retrieves logs with TON-specific filtering capabilities including byte-level filtering,
	// sorting, and pagination. This method handles all filtering, sorting, and pagination.
	// The LogStore is responsible for translating parameters to its optimal execution strategy.
	// Uses chainlink-common's LimitAndSort for standardized pagination and sorting.
	QueryLogs(ctx context.Context, query *query.LogQuery) (logs []models.Log, hasMore bool, nextCursor string, err error)
	// GetHighestMCBlockSeqno retrieves the highest masterchain block sequence number
	// from stored logs. Returns (seqno, exists, err) where exists indicates whether any
	// logs are stored. This is used for resuming processing from the last known state
	// after a service restart.
	GetHighestMCBlockSeqno(ctx context.Context) (seqno uint32, exists bool, err error)
	// DeleteExpiredLogs removes logs that have passed their pre-computed expiration time.
	// Uses the expires_at column (set at insert time as tx_timestamp + retention).
	// Logs with expires_at = NULL (retention = 0, "keep forever") are never deleted.
	// limit controls batch size per DELETE operation (use 0 for unlimited, not recommended).
	// Returns total number of rows deleted across all batches.
	DeleteExpiredLogs(ctx context.Context, limit int64) (int64, error)
	// DeleteExcessLogs removes logs exceeding max_logs_kept for each filter.
	// Uses tx_lt + msg_index ordering (descending) to keep newest logs.
	// Only processes filters with max_logs_kept > 0 (0 = unlimited).
	// limit controls batch size (use 0 for unlimited, not recommended).
	// Returns number of rows deleted.
	DeleteExcessLogs(ctx context.Context, limit int64) (int64, error)
	// DeleteLogsForDeletedFilters removes logs for filters marked is_deleted=true.
	// Uses batched deletion with LIMIT for safe removal without table locks.
	// Note: Filter row cleanup is handled separately by FilterStore.DeleteEmptyFilters.
	// Returns number of log rows deleted.
	DeleteLogsForDeletedFilters(ctx context.Context, limit int64) (int64, error)
}

// RawLogProvider provides raw logs leveraging LogPoller libs without running the full service (o11y use case)
type RawLogProvider interface {
	// GetLogs retrieves all external message outputs for an address between fromBlockSeqNo (exclusive) and toBlock (inclusive).
	GetLogs(ctx context.Context, addr *address.Address, from uint32, to *ton.BlockIDExt) ([]models.RawLog, error)
}

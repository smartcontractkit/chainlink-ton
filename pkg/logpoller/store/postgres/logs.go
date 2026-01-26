package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
)

var _ logpoller.LogStore = (*pgLogStore)(nil)

// pgLogStore implements TON log storage using PostgreSQL with advanced querying capabilities
type pgLogStore struct {
	chainID string
	orm     *DSORM
	lggr    logger.Logger
}

// NewLogStore creates a new PostgreSQL-based log store
func NewLogStore(chainID string, orm *DSORM, lggr logger.Logger) logpoller.LogStore {
	return &pgLogStore{
		chainID: chainID,
		orm:     orm,
		lggr:    logger.Named(lggr, "LogStore."+chainID),
	}
}

// SaveLogs saves multiple logs to the database in a batch operation with transaction support
func (s *pgLogStore) SaveLogs(ctx context.Context, logs []models.Log, batchInsertSize, minBatchSize uint32) (int64, error) {
	if len(logs) == 0 {
		return 0, nil
	}

	// Validate logs before expensive conversion to fail fast
	for i, log := range logs {
		if err := log.Validate(s.chainID); err != nil {
			return 0, fmt.Errorf("invalid log at index %d: %w", i, err)
		}
	}

	dbLogs := make([]logModel, len(logs))
	for i, log := range logs {
		logModel := &logModel{}
		dbLog, err := logModel.FromLog(log)
		if err != nil {
			s.lggr.Errorw("Failed to convert log to DB model", "error", err, "logIndex", i)
			return 0, fmt.Errorf("failed to convert log at index %d: %w", i, err)
		}
		dbLogs[i] = dbLog
	}

	// Build SQL and execute with transaction and batching
	totalInserted, err := s.insertLogsWithBatching(ctx, dbLogs, batchInsertSize, minBatchSize)
	if err != nil {
		s.lggr.Errorw("Failed to insert logs", "error", err, "logCount", len(dbLogs))
		return 0, fmt.Errorf("failed to save logs to database: %w", err)
	}
	return totalInserted, nil
}

// insertLogsWithBatching handles batched log insertion with transaction support
func (s *pgLogStore) insertLogsWithBatching(ctx context.Context, logs []logModel, batchInsertSize, minBatchSize uint32) (int64, error) {
	var totalInserted int64
	err := s.orm.Transact(ctx, func(orm *DSORM) error {
		inserted, err := s.insertLogsWithinTx(ctx, orm, logs, batchInsertSize, minBatchSize)
		totalInserted = inserted
		return err
	})
	return totalInserted, err
}

// insertLogsWithinTx performs the actual batch insertion within a transaction
func (s *pgLogStore) insertLogsWithinTx(ctx context.Context, orm *DSORM, logs []logModel, batchInsertSize, minBatchSize uint32) (int64, error) {
	batchSize := int(batchInsertSize)
	query := `INSERT INTO ton.log_poller_logs (
			filter_id,
			chain_id,
			address,
			event_sig,
			data_header,
			data_payload,
			tx_hash,
			tx_lt,
			tx_timestamp,
			msg_lt,
			msg_index,
			block_workchain,
			block_shard,
			block_seqno,
			block_root_hash,
			block_file_hash,
			master_block_seqno,
			created_at
		) VALUES (
			:filter_id,
			:chain_id,
			:address,
			:event_sig,
			:data_header,
			:data_payload,
			:tx_hash,
			:tx_lt,
			:tx_timestamp,
			:msg_lt,
			:msg_index,
			:block_workchain,
			:block_shard,
			:block_seqno,
			:block_root_hash,
			:block_file_hash,
			:master_block_seqno,
			NOW()
		) ON CONFLICT (tx_hash, tx_lt, msg_index) DO NOTHING
	`

	var totalInserted int64
	for i := 0; i < len(logs); i += batchSize {
		start, end := i, i+batchSize
		if end > len(logs) {
			end = len(logs)
		}

		rowsInserted, err := orm.NamedExecContext(ctx, query, logs[start:end])
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) && batchSize > int(minBatchSize) {
				// In case of DB timeouts, try to insert again with a smaller batch up to a limit
				batchSize /= 2
				i -= batchSize // counteract +=batchSize on next loop iteration
				continue
			}
			return 0, fmt.Errorf("failed to insert logs batch %d-%d: %w", start, end-1, err)
		}
		totalInserted += rowsInserted
	}
	return totalInserted, nil
}

// QueryLogs retrieves logs with TON-specific filtering capabilities including byte-level filtering,
// sorting, and pagination. Builds SQL queries and delegates execution to ORM.
func (s *pgLogStore) QueryLogs(
	ctx context.Context,
	logQuery *query.LogQuery,
) (logs []models.Log, hasMore bool, nextCursor string, err error) {
	// build the SQL query using the query builder
	sql, args, err := newQueryParser(s.chainID).Parse(logQuery)
	if err != nil {
		return nil, false, "", fmt.Errorf("failed to build log query: %w", err)
	}

	// execute query
	var dbLogs []logModel
	err = s.orm.NamedSelectContext(ctx, &dbLogs, sql, args)
	if err != nil {
		return nil, false, "", fmt.Errorf("failed to execute filtered logs query: %w", err)
	}

	// check if we have more results than requested
	if logQuery.LimitAndSort.Limit.Count > 0 && len(dbLogs) > int(logQuery.LimitAndSort.Limit.Count) { //nolint:gosec // limit values are reasonable for database queries
		hasMore = true
		dbLogs = dbLogs[:logQuery.LimitAndSort.Limit.Count] // Remove the extra record
	}

	s.lggr.Debugw("QueryLogs query executed",
		"sql", sql,
		"args", args,
		"resultCount", len(dbLogs),
		"hasMore", hasMore)

	// Convert ORM models to application models
	logs = make([]models.Log, len(dbLogs))
	for i := range dbLogs {
		logs[i], err = dbLogs[i].ToLog()
		if err != nil {
			return nil, false, "", fmt.Errorf("failed to convert db log to model at index %d (id=%d): %w", i, dbLogs[i].ID, err)
		}
	}

	// generate next cursor if there are more results
	if hasMore && len(logs) > 0 {
		lastLog := logs[len(logs)-1]
		nextCursor = query.FormatCursor(lastLog.Address, lastLog.MsgLT)
	}

	return logs, hasMore, nextCursor, nil
}

// GetHighestMCBlockSeqno retrieves the highest masterchain block sequence number
// from stored logs for this chain. Returns (seqno, exists, err) where exists indicates
// whether any logs are stored.
func (s *pgLogStore) GetHighestMCBlockSeqno(ctx context.Context) (uint32, bool, error) {
	var result *int64

	sql := `SELECT MAX(master_block_seqno) FROM ton.log_poller_logs WHERE chain_id = :chain_id`
	err := s.orm.NamedGetContext(ctx, &result, sql, map[string]any{"chain_id": s.chainID})
	if err != nil {
		return 0, false, fmt.Errorf("failed to query latest master block seqno: %w", err)
	}

	// MAX returns NULL if no rows exist
	if result == nil {
		return 0, false, nil
	}

	//nolint:gosec // G115: safe conversion - master_block_seqno is always positive and within uint32 range
	return uint32(*result), true, nil
}

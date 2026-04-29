package logpoller

import (
	"context"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	frameworkmetrics "github.com/smartcontractkit/chainlink-framework/metrics"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
)

var _ LogStore = (*ObservedLogStore)(nil)

// ObservedLogStore wraps a LogStore with metrics instrumentation
type ObservedLogStore struct {
	LogStore
	metrics *logPollerMetrics
	lggr    logger.Logger
}

// NewObservedLogStore creates a new observed log store wrapper
func NewObservedLogStore(store LogStore, metrics *logPollerMetrics, lggr logger.Logger) *ObservedLogStore {
	return &ObservedLogStore{
		LogStore: store,
		metrics:  metrics,
		lggr:     logger.Named(lggr, "ObservedLogStore"),
	}
}

// SaveLogs wraps the underlying SaveLogs with metrics
func (o *ObservedLogStore) SaveLogs(ctx context.Context, logs []models.Log, batchInsertSize, minBatchSize uint32) (int64, error) {
	start := time.Now()
	count, err := o.LogStore.SaveLogs(ctx, logs, batchInsertSize, minBatchSize)

	o.metrics.frameworkMetrics.RecordQueryDuration(ctx, "SaveLogs", frameworkmetrics.Create, time.Since(start).Seconds())
	if err == nil && count > 0 {
		o.metrics.frameworkMetrics.IncrementLogsInserted(ctx, count)

		// Record discovery latency using the newest log's TxTimestamp.
		// TxTimestamp is set from tx.Transaction.Now (uint32 Unix seconds) during parsing.
		// Latency = wall clock now - transaction timestamp, in seconds.
		newestTimestamp := logs[0].TxTimestamp
		for _, l := range logs[1:] {
			if l.TxTimestamp.After(newestTimestamp) {
				newestTimestamp = l.TxTimestamp
			}
		}
		o.metrics.frameworkMetrics.RecordLogDiscoveryLatency(ctx, time.Since(newestTimestamp).Seconds())
	}

	return count, err
}

// QueryLogs wraps the underlying QueryLogs with metrics
func (o *ObservedLogStore) QueryLogs(ctx context.Context, logQuery *query.LogQuery) ([]models.Log, bool, string, error) {
	start := time.Now()
	logs, hasMore, nextCursor, err := o.LogStore.QueryLogs(ctx, logQuery)

	o.metrics.frameworkMetrics.RecordQueryDuration(ctx, "QueryLogs", frameworkmetrics.Read, time.Since(start).Seconds())
	if err == nil {
		o.metrics.frameworkMetrics.RecordQueryDatasetSize(ctx, "QueryLogs", frameworkmetrics.Read, int64(len(logs)))
	}

	return logs, hasMore, nextCursor, err
}

// GetHighestMCBlockSeqno wraps the underlying GetHighestMCBlockSeqno with metrics
func (o *ObservedLogStore) GetHighestMCBlockSeqno(ctx context.Context) (uint32, bool, error) {
	start := time.Now()
	seqno, exists, err := o.LogStore.GetHighestMCBlockSeqno(ctx)

	o.metrics.frameworkMetrics.RecordQueryDuration(ctx, "GetHighestMCBlockSeqno", frameworkmetrics.Read, time.Since(start).Seconds())

	return seqno, exists, err
}

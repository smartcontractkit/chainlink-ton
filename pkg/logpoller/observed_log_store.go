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

	o.metrics.RecordQueryDuration(ctx, "SaveLogs", frameworkmetrics.Create, time.Since(start))
	if err == nil && count > 0 {
		o.metrics.AddLogsInserted(ctx, count)
	}

	return count, err
}

// QueryLogs wraps the underlying QueryLogs with metrics
func (o *ObservedLogStore) QueryLogs(ctx context.Context, logQuery *query.LogQuery) ([]models.Log, bool, string, error) {
	start := time.Now()
	logs, hasMore, nextCursor, err := o.LogStore.QueryLogs(ctx, logQuery)

	o.metrics.RecordQueryDuration(ctx, "QueryLogs", frameworkmetrics.Read, time.Since(start))
	if err == nil {
		o.metrics.SetQueryResultSize(ctx, "QueryLogs", len(logs))
	}

	return logs, hasMore, nextCursor, err
}

package logpoller

import (
	"context"
	"sync"
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

	// pending is set on the transaction-bound store handed out by Transact. Insert metrics
	// recorded through it are held until the transaction commits.
	pending *pendingInsertMetrics
}

// pendingInsertMetrics accumulates insert metrics of a transaction until it commits, so logs
// that end up rolled back (and are saved again when the range is retried) are not counted.
type pendingInsertMetrics struct {
	mu               sync.Mutex
	inserted         int64
	newestTimestamps []time.Time // newest log TxTimestamp of each SaveLogs call that inserted logs
}

func (p *pendingInsertMetrics) add(inserted int64, newestTimestamp time.Time) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.inserted += inserted
	p.newestTimestamps = append(p.newestTimestamps, newestTimestamp)
}

// NewObservedLogStore creates a new observed log store wrapper
func NewObservedLogStore(store LogStore, metrics *logPollerMetrics, lggr logger.Logger) *ObservedLogStore {
	return &ObservedLogStore{
		LogStore: store,
		metrics:  metrics,
		lggr:     logger.Named(lggr, "ObservedLogStore"),
	}
}

// SaveLogs wraps the underlying SaveLogs with metrics. Query duration is recorded immediately;
// inserted-logs and discovery-latency metrics are recorded once the logs are committed.
func (o *ObservedLogStore) SaveLogs(ctx context.Context, logs []models.Log, batchInsertSize, minBatchSize uint32) (int64, error) {
	start := time.Now()
	count, err := o.LogStore.SaveLogs(ctx, logs, batchInsertSize, minBatchSize)

	o.metrics.frameworkMetrics.RecordQueryDuration(ctx, "SaveLogs", frameworkmetrics.Create, time.Since(start).Seconds())
	if err == nil && count > 0 {
		newestTimestamp := newestTxTimestamp(logs)
		// Inside a transaction (pending is set by Transact) the logs can still be rolled back,
		// so their metrics are held until commit. Outside one, SaveLogs commits on its own and
		// the logs are already persisted.
		if o.pending != nil {
			o.pending.add(count, newestTimestamp)
		} else {
			o.recordInserted(ctx, count, newestTimestamp)
		}
	}

	return count, err
}

// Transact wraps the underlying Transact, keeping metrics instrumentation on the
// transaction-bound store passed to fn. Insert metrics recorded inside the transaction
// are published only if it commits.
func (o *ObservedLogStore) Transact(ctx context.Context, fn func(tx LogStore) error) error {
	// a nested Transact joins the enclosing transaction, so its metrics are published with it
	pending := o.pending
	if pending == nil {
		pending = &pendingInsertMetrics{}
	}

	err := o.LogStore.Transact(ctx, func(tx LogStore) error {
		return fn(&ObservedLogStore{
			LogStore: tx,
			metrics:  o.metrics,
			lggr:     o.lggr,
			pending:  pending,
		})
	})
	if err != nil || o.pending != nil {
		return err
	}

	if pending.inserted > 0 {
		o.metrics.frameworkMetrics.IncrementLogsInserted(ctx, pending.inserted)
	}
	for _, newestTimestamp := range pending.newestTimestamps {
		o.recordDiscoveryLatency(ctx, newestTimestamp)
	}
	return nil
}

func (o *ObservedLogStore) recordInserted(ctx context.Context, inserted int64, newestTimestamp time.Time) {
	o.metrics.frameworkMetrics.IncrementLogsInserted(ctx, inserted)
	o.recordDiscoveryLatency(ctx, newestTimestamp)
}

// recordDiscoveryLatency records the time from the newest saved log's TxTimestamp until now,
// in seconds. TxTimestamp is set from tx.Transaction.Now (uint32 Unix seconds) during parsing.
func (o *ObservedLogStore) recordDiscoveryLatency(ctx context.Context, newestTimestamp time.Time) {
	o.metrics.frameworkMetrics.RecordLogDiscoveryLatency(ctx, time.Since(newestTimestamp).Seconds())
}

// newestTxTimestamp returns the newest TxTimestamp among logs, which must not be empty.
func newestTxTimestamp(logs []models.Log) time.Time {
	newest := logs[0].TxTimestamp
	for _, l := range logs[1:] {
		if l.TxTimestamp.After(newest) {
			newest = l.TxTimestamp
		}
	}
	return newest
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

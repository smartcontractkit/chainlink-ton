package logpoller

import (
	"context"
	"fmt"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/smartcontractkit/chainlink-common/pkg/beholder"
	"github.com/smartcontractkit/chainlink-common/pkg/metrics"
)

// Prometheus metrics for TON LogPoller
var (
	promTonLpPollDuration = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ton_logpoller_poll_duration_seconds",
		Help: "Duration of the last log poller poll iteration",
	}, []string{"chainID"})

	promTonLpPollErrors = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ton_logpoller_poll_errors_total",
		Help: "Total number of poll iteration errors",
	}, []string{"chainID"})

	promTonLpBlocksBehind = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ton_logpoller_blocks_behind",
		Help: "Number of blocks behind chain head (latest_block - last_processed_block)",
	}, []string{"chainID"})

	promTonLpLastProcessedBlock = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ton_logpoller_last_processed_block",
		Help: "Last processed masterchain block sequence number",
	}, []string{"chainID"})

	promTonLpBlocksProcessed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ton_logpoller_blocks_processed_total",
		Help: "Total number of blocks processed",
	}, []string{"chainID"})
)

// serviceMetrics provides instrumentation for the TON LogPoller
type serviceMetrics struct {
	metrics.Labeler
	chainID string

	// core service metrics (OTel)
	pollDuration       metric.Float64Gauge
	pollErrors         metric.Int64Counter
	blocksBehind       metric.Int64Gauge
	lastProcessedBlock metric.Int64Gauge
	blocksProcessed    metric.Int64Counter
	// TODO: add loader_errors_total counter (for tx loading failures)
	// TODO: add parse_errors_total counter (for log parsing failures)
	// TODO: add query_duration_seconds histogram (for database ops)
	// TODO: add observed store wrappers for FilterStore and LogStore
}

// newMetrics creates a new metrics instance for TON LogPoller
func newMetrics(chainID string) (*serviceMetrics, error) {
	m := beholder.GetMeter()

	pollDuration, err := m.Float64Gauge("ton_logpoller_poll_duration_seconds")
	if err != nil {
		return nil, fmt.Errorf("failed to register poll duration: %w", err)
	}

	pollErrors, err := m.Int64Counter("ton_logpoller_poll_errors_total")
	if err != nil {
		return nil, fmt.Errorf("failed to register poll errors: %w", err)
	}

	blocksBehind, err := m.Int64Gauge("ton_logpoller_blocks_behind")
	if err != nil {
		return nil, fmt.Errorf("failed to register blocks behind: %w", err)
	}

	lastProcessedBlock, err := m.Int64Gauge("ton_logpoller_last_processed_block")
	if err != nil {
		return nil, fmt.Errorf("failed to register last processed block: %w", err)
	}

	blocksProcessed, err := m.Int64Counter("ton_logpoller_blocks_processed_total")
	if err != nil {
		return nil, fmt.Errorf("failed to register blocks processed: %w", err)
	}

	return &serviceMetrics{
		chainID: chainID,
		Labeler: metrics.NewLabeler().With("chainID", chainID),

		pollDuration:       pollDuration,
		pollErrors:         pollErrors,
		blocksBehind:       blocksBehind,
		lastProcessedBlock: lastProcessedBlock,
		blocksProcessed:    blocksProcessed,
	}, nil
}

// getOtelAttributes returns OTel attributes for this metrics instance
func (m *serviceMetrics) getOtelAttributes() []attribute.KeyValue {
	return beholder.OtelAttributes(m.Labels).AsStringAttributes()
}

// SetPollDuration sets the duration of the last poll iteration
func (m *serviceMetrics) SetPollDuration(ctx context.Context, duration time.Duration) {
	seconds := duration.Seconds()
	promTonLpPollDuration.WithLabelValues(m.chainID).Set(seconds)
	m.pollDuration.Record(ctx, seconds, metric.WithAttributes(m.getOtelAttributes()...))
}

// IncrementPollErrors increments the poll error counter
func (m *serviceMetrics) IncrementPollErrors(ctx context.Context) {
	promTonLpPollErrors.WithLabelValues(m.chainID).Inc()
	m.pollErrors.Add(ctx, 1, metric.WithAttributes(m.getOtelAttributes()...))
}

// SetBlocksBehind sets the number of blocks behind chain head
func (m *serviceMetrics) SetBlocksBehind(ctx context.Context, latestBlock, lastProcessedBlock uint32) {
	behind := int64(latestBlock) - int64(lastProcessedBlock)
	promTonLpBlocksBehind.WithLabelValues(m.chainID).Set(float64(behind))
	m.blocksBehind.Record(ctx, behind, metric.WithAttributes(m.getOtelAttributes()...))
}

// SetLastProcessedBlock sets the last processed block sequence number
func (m *serviceMetrics) SetLastProcessedBlock(ctx context.Context, seqNo uint32) {
	promTonLpLastProcessedBlock.WithLabelValues(m.chainID).Set(float64(seqNo))
	m.lastProcessedBlock.Record(ctx, int64(seqNo), metric.WithAttributes(m.getOtelAttributes()...))
}

// AddBlocksProcessed increments the blocks processed counter
func (m *serviceMetrics) AddBlocksProcessed(ctx context.Context, count int64) {
	promTonLpBlocksProcessed.WithLabelValues(m.chainID).Add(float64(count))
	m.blocksProcessed.Add(ctx, count, metric.WithAttributes(m.getOtelAttributes()...))
}

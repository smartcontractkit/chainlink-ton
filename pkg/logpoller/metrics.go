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
	promTonLpPollDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "ton_logpoller_poll_duration_seconds",
		Help:    "Duration of each log poller poll iteration",
		Buckets: []float64{1, 5, 10, 30}, // TON block time: approx. 5 seconds
	}, []string{"chainID"})

	promTonLpPollErrors = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ton_logpoller_poll_errors_total",
		Help: "Total number of poll iteration errors",
	}, []string{"chainID"})

	promTonLpLastProcessedBlock = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ton_logpoller_last_processed_block",
		Help: "Last processed masterchain block sequence number",
	}, []string{"chainID"})
)

// serviceMetrics provides instrumentation for the TON LogPoller
type serviceMetrics struct {
	metrics.Labeler
	chainID string

	// core service metrics (OTel)
	pollDuration       metric.Float64Histogram
	pollErrors         metric.Int64Counter
	lastProcessedBlock metric.Int64Gauge

	// TODO: add blocks_processed_total counter
	// TODO: add loader_errors_total counter (for tx loading failures)
	// TODO: add parse_errors_total counter (for log parsing failures)
	// TODO: add query_duration_seconds histogram (for database ops)
	// TODO: add observed store wrappers for FilterStore and LogStore
}

// newMetrics creates a new metrics instance for TON LogPoller
func newMetrics(chainID string) (*serviceMetrics, error) {
	m := beholder.GetMeter()

	pollDuration, err := m.Float64Histogram("ton_logpoller_poll_duration_seconds")
	if err != nil {
		return nil, fmt.Errorf("failed to register poll duration: %w", err)
	}

	pollErrors, err := m.Int64Counter("ton_logpoller_poll_errors_total")
	if err != nil {
		return nil, fmt.Errorf("failed to register poll errors: %w", err)
	}

	lastProcessedBlock, err := m.Int64Gauge("ton_logpoller_last_processed_block")
	if err != nil {
		return nil, fmt.Errorf("failed to register last processed block: %w", err)
	}

	return &serviceMetrics{
		chainID: chainID,
		Labeler: metrics.NewLabeler().With("chainID", chainID),

		pollDuration:       pollDuration,
		pollErrors:         pollErrors,
		lastProcessedBlock: lastProcessedBlock,
	}, nil
}

// getOtelAttributes returns OTel attributes for this metrics instance
func (m *serviceMetrics) getOtelAttributes() []attribute.KeyValue {
	return beholder.OtelAttributes(m.Labels).AsStringAttributes()
}

// RecordPollDuration records the duration of a poll iteration
func (m *serviceMetrics) RecordPollDuration(ctx context.Context, duration time.Duration) {
	seconds := duration.Seconds()
	promTonLpPollDuration.WithLabelValues(m.chainID).Observe(seconds)
	m.pollDuration.Record(ctx, seconds, metric.WithAttributes(m.getOtelAttributes()...))
}

// IncrementPollErrors increments the poll error counter
func (m *serviceMetrics) IncrementPollErrors(ctx context.Context) {
	promTonLpPollErrors.WithLabelValues(m.chainID).Inc()
	m.pollErrors.Add(ctx, 1, metric.WithAttributes(m.getOtelAttributes()...))
}

// SetLastProcessedBlock sets the last processed block sequence number
func (m *serviceMetrics) SetLastProcessedBlock(ctx context.Context, seqNo uint32) {
	promTonLpLastProcessedBlock.WithLabelValues(m.chainID).Set(float64(seqNo))
	m.lastProcessedBlock.Record(ctx, int64(seqNo), metric.WithAttributes(m.getOtelAttributes()...))
}

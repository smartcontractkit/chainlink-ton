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
	frameworkmetrics "github.com/smartcontractkit/chainlink-framework/metrics"
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

	promTonLpLogsInserted = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ton_logpoller_logs_inserted_total",
		Help: "Total number of logs inserted to database",
	}, []string{"chainID"})

	promTonLpLoaderErrors = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ton_logpoller_loader_errors_total",
		Help: "Total number of transaction loading errors",
	}, []string{"chainID"})

	promTonLpParseErrors = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ton_logpoller_parse_errors_total",
		Help: "Total number of log parsing errors",
	}, []string{"chainID"})

	// Query metrics for observed stores
	promTonLpQueryDuration = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ton_logpoller_query_duration_seconds",
		Help: "Duration of last database query by operation",
	}, []string{"chainID", "query", "type"})

	promTonLpAddressesMonitored = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ton_logpoller_addresses_monitored",
		Help: "Number of addresses being monitored",
	}, []string{"chainID"})

	promTonLpQueryResultSize = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ton_logpoller_query_result_size",
		Help: "Number of rows returned by query",
	}, []string{"chainID", "query"})
)

// logPollerMetrics provides instrumentation for the TON LogPoller
type logPollerMetrics struct {
	metrics.Labeler
	chainID string

	// core service metrics (OTel)
	pollDuration            metric.Float64Gauge
	pollErrors              metric.Int64Counter
	blocksBehind            metric.Int64Gauge
	lastProcessedBlockSeqNo metric.Int64Gauge
	blocksProcessed         metric.Int64Counter
	logsInserted            metric.Int64Counter
	loaderErrors            metric.Int64Counter
	parseErrors             metric.Int64Counter

	// query metrics for observed stores (OTel)
	queryDuration      metric.Float64Gauge
	addressesMonitored metric.Int64Gauge
	queryResultSize    metric.Int64Gauge
}

// newMetrics creates a new metrics instance for TON LogPoller
func newMetrics(chainID string) (*logPollerMetrics, error) {
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

	lastProcessedBlockSeqNo, err := m.Int64Gauge("ton_logpoller_last_processed_block")
	if err != nil {
		return nil, fmt.Errorf("failed to register last processed block: %w", err)
	}

	blocksProcessed, err := m.Int64Counter("ton_logpoller_blocks_processed_total")
	if err != nil {
		return nil, fmt.Errorf("failed to register blocks processed: %w", err)
	}

	logsInserted, err := m.Int64Counter("ton_logpoller_logs_inserted_total")
	if err != nil {
		return nil, fmt.Errorf("failed to register logs inserted: %w", err)
	}

	loaderErrors, err := m.Int64Counter("ton_logpoller_loader_errors_total")
	if err != nil {
		return nil, fmt.Errorf("failed to register loader errors: %w", err)
	}

	parseErrors, err := m.Int64Counter("ton_logpoller_parse_errors_total")
	if err != nil {
		return nil, fmt.Errorf("failed to register parse errors: %w", err)
	}

	queryDuration, err := m.Float64Gauge("ton_logpoller_query_duration_seconds")
	if err != nil {
		return nil, fmt.Errorf("failed to register query duration: %w", err)
	}

	addressesMonitored, err := m.Int64Gauge("ton_logpoller_addresses_monitored")
	if err != nil {
		return nil, fmt.Errorf("failed to register addresses monitored: %w", err)
	}

	queryResultSize, err := m.Int64Gauge("ton_logpoller_query_result_size")
	if err != nil {
		return nil, fmt.Errorf("failed to register query result size: %w", err)
	}

	return &logPollerMetrics{
		chainID: chainID,
		Labeler: metrics.NewLabeler().With("chainID", chainID),

		pollDuration:            pollDuration,
		pollErrors:              pollErrors,
		blocksBehind:            blocksBehind,
		lastProcessedBlockSeqNo: lastProcessedBlockSeqNo,
		blocksProcessed:         blocksProcessed,
		logsInserted:            logsInserted,
		loaderErrors:            loaderErrors,
		parseErrors:             parseErrors,
		queryDuration:           queryDuration,
		addressesMonitored:      addressesMonitored,
		queryResultSize:         queryResultSize,
	}, nil
}

// getOtelAttributes returns OTel attributes for this metrics instance
func (m *logPollerMetrics) getOtelAttributes() []attribute.KeyValue {
	return beholder.OtelAttributes(m.Labels).AsStringAttributes()
}

// SetPollDuration sets the duration of the last poll iteration
func (m *logPollerMetrics) SetPollDuration(ctx context.Context, duration time.Duration) {
	seconds := duration.Seconds()
	promTonLpPollDuration.WithLabelValues(m.chainID).Set(seconds)
	m.pollDuration.Record(ctx, seconds, metric.WithAttributes(m.getOtelAttributes()...))
}

// IncrementPollErrors increments the poll error counter
func (m *logPollerMetrics) IncrementPollErrors(ctx context.Context) {
	promTonLpPollErrors.WithLabelValues(m.chainID).Inc()
	m.pollErrors.Add(ctx, 1, metric.WithAttributes(m.getOtelAttributes()...))
}

// SetBlocksBehind sets the number of blocks behind chain head
func (m *logPollerMetrics) SetBlocksBehind(ctx context.Context, latestBlock, lastProcessedBlockSeqNo uint32) {
	behind := int64(latestBlock) - int64(lastProcessedBlockSeqNo)
	promTonLpBlocksBehind.WithLabelValues(m.chainID).Set(float64(behind))
	m.blocksBehind.Record(ctx, behind, metric.WithAttributes(m.getOtelAttributes()...))
}

// SetLastProcessedBlock sets the last processed block sequence number
func (m *logPollerMetrics) SetLastProcessedBlock(ctx context.Context, seqNo uint32) {
	promTonLpLastProcessedBlock.WithLabelValues(m.chainID).Set(float64(seqNo))
	m.lastProcessedBlockSeqNo.Record(ctx, int64(seqNo), metric.WithAttributes(m.getOtelAttributes()...))
}

// AddBlocksProcessed increments the blocks processed counter
func (m *logPollerMetrics) AddBlocksProcessed(ctx context.Context, count int64) {
	promTonLpBlocksProcessed.WithLabelValues(m.chainID).Add(float64(count))
	m.blocksProcessed.Add(ctx, count, metric.WithAttributes(m.getOtelAttributes()...))
}

// AddLogsInserted increments the logs inserted counter
func (m *logPollerMetrics) AddLogsInserted(ctx context.Context, count int64) {
	promTonLpLogsInserted.WithLabelValues(m.chainID).Add(float64(count))
	m.logsInserted.Add(ctx, count, metric.WithAttributes(m.getOtelAttributes()...))
}

// IncrementLoaderErrors increments the loader error counter
func (m *logPollerMetrics) IncrementLoaderErrors(ctx context.Context) {
	promTonLpLoaderErrors.WithLabelValues(m.chainID).Inc()
	m.loaderErrors.Add(ctx, 1, metric.WithAttributes(m.getOtelAttributes()...))
}

// IncrementParseErrors increments the parse error counter
func (m *logPollerMetrics) IncrementParseErrors(ctx context.Context) {
	promTonLpParseErrors.WithLabelValues(m.chainID).Inc()
	m.parseErrors.Add(ctx, 1, metric.WithAttributes(m.getOtelAttributes()...))
}

// RecordQueryDuration records the duration of a database query
func (m *logPollerMetrics) RecordQueryDuration(ctx context.Context, queryName string, queryType frameworkmetrics.QueryType, duration time.Duration) {
	seconds := duration.Seconds()
	promTonLpQueryDuration.WithLabelValues(m.chainID, queryName, string(queryType)).Set(seconds)
	attrs := append(m.getOtelAttributes(), attribute.String("query", queryName), attribute.String("type", string(queryType)))
	m.queryDuration.Record(ctx, seconds, metric.WithAttributes(attrs...))
}

// SetAddressesMonitored sets the number of addresses being monitored
func (m *logPollerMetrics) SetAddressesMonitored(ctx context.Context, count int) {
	promTonLpAddressesMonitored.WithLabelValues(m.chainID).Set(float64(count))
	m.addressesMonitored.Record(ctx, int64(count), metric.WithAttributes(m.getOtelAttributes()...))
}

// SetQueryResultSize sets the result size of a query
func (m *logPollerMetrics) SetQueryResultSize(ctx context.Context, queryName string, count int) {
	promTonLpQueryResultSize.WithLabelValues(m.chainID, queryName).Set(float64(count))
	attrs := append(m.getOtelAttributes(), attribute.String("query", queryName))
	m.queryResultSize.Record(ctx, int64(count), metric.WithAttributes(attrs...))
}

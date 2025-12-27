package txm

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

var (
	// Successful transactions
	promTonTxmSuccessTxs = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ton_txm_tx_success",
		Help: "Number of finalized transactions that are included and successfully executed on chain",
	}, []string{"chainID"})
	promTonTxmFinalizedTxs = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ton_txm_tx_finalized",
		Help: "Number of transactions that are finalized on chain. Can include both successful and reverted txs",
	}, []string{"chainID"})

	// Inflight transactions
	promTonTxmPendingTxs = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ton_txm_tx_pending",
		Help: "Number of transactions that are pending confirmation",
	}, []string{"chainID"})

	// Error cases
	promTonTxmFailedToBroadcastTxs = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ton_txm_tx_error_broadcast",
		Help: "Number of transactions that failed to be broadcasted even after all retries",
	}, []string{"chainID"})
	promTonTxmRevertTxs = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ton_txm_tx_error_revert",
		Help: "Number of finalized transactions that are included and failed onchain",
	}, []string{"chainID", "exitCode"})

	// Latency metrics
	promTonTxmBroadcastLatency = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ton_txm_broadcast_latency_seconds",
		Help: "Time taken from enqueuing to broadcasting a transaction",
	}, []string{"chainID"})
	promTonTxmFinalizationLatency = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ton_txm_finalization_latency_seconds",
		Help: "Time from broadcast to finalization",
	}, []string{"chainID"})
)

type txmMetrics struct {
	metrics.Labeler
	chainID string

	// successful transactions
	successTxs   metric.Int64Counter
	finalizedTxs metric.Int64Counter

	// inflight transactions
	pendingTxs metric.Int64Gauge

	// error cases
	failedToBroadcastTxs metric.Int64Counter
	revertTxs            metric.Int64Counter

	// latency metrics
	broadcastLatency    metric.Float64Gauge
	finalizationLatency metric.Float64Gauge
}

func newMetrics(chainID string) (*txmMetrics, error) {
	m := beholder.GetMeter()
	var err error

	successTxs, err := m.Int64Counter("ton_txm_tx_success")
	if err != nil {
		return nil, fmt.Errorf("failed to register ton success txs: %w", err)
	}

	finalizedTxs, err := m.Int64Counter("ton_txm_tx_finalized")
	if err != nil {
		return nil, fmt.Errorf("failed to register ton finalized txs: %w", err)
	}

	pendingTxs, err := m.Int64Gauge("ton_txm_tx_pending")
	if err != nil {
		return nil, fmt.Errorf("failed to register ton pending txs: %w", err)
	}

	failedToBroadcastTxs, err := m.Int64Counter("ton_txm_tx_error_broadcast")
	if err != nil {
		return nil, fmt.Errorf("failed to register ton failed to broadcast txs: %w", err)
	}

	revertTxs, err := m.Int64Counter("ton_txm_tx_error_revert")
	if err != nil {
		return nil, fmt.Errorf("failed to register ton revert txs: %w", err)
	}

	broadcastLatency, err := m.Float64Gauge("ton_txm_broadcast_latency_seconds")
	if err != nil {
		return nil, fmt.Errorf("failed to register ton broadcast latency: %w", err)
	}

	finalizationLatency, err := m.Float64Gauge("ton_txm_finalization_latency_seconds")
	if err != nil {
		return nil, fmt.Errorf("failed to register ton finalization latency: %w", err)
	}

	return &txmMetrics{
		chainID: chainID,
		Labeler: metrics.NewLabeler().With("chainID", chainID),

		successTxs:   successTxs,
		finalizedTxs: finalizedTxs,
		pendingTxs:   pendingTxs,

		failedToBroadcastTxs: failedToBroadcastTxs,
		revertTxs:            revertTxs,

		broadcastLatency:    broadcastLatency,
		finalizationLatency: finalizationLatency,
	}, nil
}

func (m *txmMetrics) getOtelAttributes() []attribute.KeyValue {
	return beholder.OtelAttributes(m.Labels).AsStringAttributes()
}

func (m *txmMetrics) IncrementSuccessTxs(ctx context.Context) {
	promTonTxmSuccessTxs.WithLabelValues(m.chainID).Add(1)
	m.successTxs.Add(ctx, 1, metric.WithAttributes(m.getOtelAttributes()...))
}

func (m *txmMetrics) IncrementFinalizedTxs(ctx context.Context) {
	promTonTxmFinalizedTxs.WithLabelValues(m.chainID).Add(1)
	m.finalizedTxs.Add(ctx, 1, metric.WithAttributes(m.getOtelAttributes()...))
}

func (m *txmMetrics) SetPendingTxs(ctx context.Context, count int) {
	promTonTxmPendingTxs.WithLabelValues(m.chainID).Set(float64(count))
	m.pendingTxs.Record(ctx, int64(count), metric.WithAttributes(m.getOtelAttributes()...))
}

func (m *txmMetrics) IncrementFailedToBroadcastTxs(ctx context.Context) {
	promTonTxmFailedToBroadcastTxs.WithLabelValues(m.chainID).Add(1)
	m.failedToBroadcastTxs.Add(ctx, 1, metric.WithAttributes(m.getOtelAttributes()...))
}

func (m *txmMetrics) IncrementRevertTxs(ctx context.Context, exitCode string) {
	promTonTxmRevertTxs.WithLabelValues(m.chainID, exitCode).Add(1)
	attrs := append(m.getOtelAttributes(), attribute.String("exitCode", exitCode))
	m.revertTxs.Add(ctx, 1, metric.WithAttributes(attrs...))
}

func (m *txmMetrics) RecordBroadcastLatency(ctx context.Context, duration time.Duration) {
	seconds := duration.Seconds()
	promTonTxmBroadcastLatency.WithLabelValues(m.chainID).Set(seconds)
	m.broadcastLatency.Record(ctx, seconds, metric.WithAttributes(m.getOtelAttributes()...))
}

func (m *txmMetrics) RecordFinalizationLatency(ctx context.Context, duration time.Duration) {
	seconds := duration.Seconds()
	promTonTxmFinalizationLatency.WithLabelValues(m.chainID).Set(seconds)
	m.finalizationLatency.Record(ctx, seconds, metric.WithAttributes(m.getOtelAttributes()...))
}

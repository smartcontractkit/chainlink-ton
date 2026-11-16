package logpoller

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	frameworkmetrics "github.com/smartcontractkit/chainlink-framework/metrics"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// recordingMetrics records the framework metrics the ObservedLogStore emits.
type recordingMetrics struct {
	frameworkmetrics.GenericLogPollerMetrics // methods not used by ObservedLogStore are left unimplemented

	mu                 sync.Mutex
	queryDurations     []string
	logsInserted       int64
	discoveryLatencies []float64
}

func (m *recordingMetrics) RecordQueryDuration(_ context.Context, queryName string, _ frameworkmetrics.QueryType, _ float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.queryDurations = append(m.queryDurations, queryName)
}

func (m *recordingMetrics) IncrementLogsInserted(_ context.Context, numLogs int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logsInserted += numLogs
}

func (m *recordingMetrics) RecordLogDiscoveryLatency(_ context.Context, latency float64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.discoveryLatencies = append(m.discoveryLatencies, latency)
}

func (m *recordingMetrics) snapshot() (queries int, inserted int64, discoverySamples int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.queryDurations), m.logsInserted, len(m.discoveryLatencies)
}

func newRecordingObservedStore(store LogStore) (*ObservedLogStore, *recordingMetrics) {
	recorder := &recordingMetrics{}
	return NewObservedLogStore(store, &logPollerMetrics{frameworkMetrics: recorder}, logger.Nop()), recorder
}

func logsWithTimestamps(timestamps ...time.Time) []models.Log {
	logs := make([]models.Log, len(timestamps))
	for i, ts := range timestamps {
		logs[i] = models.Log{TxTimestamp: ts}
	}
	return logs
}

func TestObservedLogStore_InsertMetrics(t *testing.T) {
	t.Parallel()

	now := time.Now()

	t.Run("outside a transaction metrics are recorded immediately", func(t *testing.T) {
		t.Parallel()
		observed, recorder := newRecordingObservedStore(&testLogStore{})

		_, err := observed.SaveLogs(t.Context(), logsWithTimestamps(now.Add(-time.Hour), now.Add(-time.Minute)), 100, 10)
		require.NoError(t, err)

		queries, inserted, samples := recorder.snapshot()
		require.Equal(t, 1, queries)
		require.Equal(t, int64(2), inserted)
		require.Equal(t, 1, samples)

		// latency is measured from the newest log in the call
		require.InDelta(t, time.Minute.Seconds(), recorder.discoveryLatencies[0], 5)
	})

	t.Run("committed transaction publishes insert metrics after commit", func(t *testing.T) {
		t.Parallel()
		observed, recorder := newRecordingObservedStore(&testLogStore{})

		err := observed.Transact(t.Context(), func(tx LogStore) error {
			if _, err := tx.SaveLogs(t.Context(), logsWithTimestamps(now, now), 100, 10); err != nil {
				return err
			}
			if _, err := tx.SaveLogs(t.Context(), logsWithTimestamps(now), 100, 10); err != nil {
				return err
			}

			queries, inserted, samples := recorder.snapshot()
			require.Equal(t, 2, queries, "query durations are recorded immediately")
			require.Zero(t, inserted, "inserted logs are not published before commit")
			require.Zero(t, samples, "discovery latency is not published before commit")
			return nil
		})
		require.NoError(t, err)

		queries, inserted, samples := recorder.snapshot()
		require.Equal(t, 2, queries)
		require.Equal(t, int64(3), inserted)
		require.Equal(t, 2, samples, "one discovery latency sample per SaveLogs call")
	})

	rollbackTests := []struct {
		name  string
		store *testLogStore
		fnErr error
	}{
		{"fn error rolls back", &testLogStore{}, errors.New("loader error")},
		{"commit error rolls back", &testLogStore{commitErr: errors.New("commit failed")}, nil},
	}
	for _, tt := range rollbackTests {
		t.Run(tt.name+" without publishing insert metrics", func(t *testing.T) {
			t.Parallel()
			observed, recorder := newRecordingObservedStore(tt.store)

			err := observed.Transact(t.Context(), func(tx LogStore) error {
				if _, err := tx.SaveLogs(t.Context(), logsWithTimestamps(now, now), 100, 10); err != nil {
					return err
				}
				return tt.fnErr
			})
			require.Error(t, err)

			queries, inserted, samples := recorder.snapshot()
			require.Equal(t, 1, queries, "query durations are recorded even when the transaction rolls back")
			require.Zero(t, inserted)
			require.Zero(t, samples)
		})
	}

	t.Run("nested transaction publishes once with the outer commit", func(t *testing.T) {
		t.Parallel()
		observed, recorder := newRecordingObservedStore(&testLogStore{})

		err := observed.Transact(t.Context(), func(tx LogStore) error {
			if err := tx.Transact(t.Context(), func(inner LogStore) error {
				_, err := inner.SaveLogs(t.Context(), logsWithTimestamps(now), 100, 10)
				return err
			}); err != nil {
				return err
			}

			_, inserted, samples := recorder.snapshot()
			require.Zero(t, inserted, "nested commit must not publish before the outer transaction commits")
			require.Zero(t, samples)
			return nil
		})
		require.NoError(t, err)

		_, inserted, samples := recorder.snapshot()
		require.Equal(t, int64(1), inserted)
		require.Equal(t, 1, samples)
	})
}

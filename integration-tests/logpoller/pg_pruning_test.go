package logpoller

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/integration-tests/logpoller/testdata"
	pgtest "github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/postgres"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/postgres"
)

// logOption is a functional option for creating test logs
type logOption func(*models.Log)

// withExpiresAt sets the expiration time for a log
func withExpiresAt(t time.Time) logOption {
	return func(l *models.Log) {
		l.ExpiresAt = &t
	}
}

// createTestLogsForPruning creates sample logs for pruning tests with deterministic values
func createTestLogsForPruning(t *testing.T, addr *address.Address, filterID int64, count int, opts ...logOption) []models.Log {
	t.Helper()

	baseTime := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	logs := make([]models.Log, count)

	for i := range count {
		eventCell := cell.BeginCell().
			MustStoreUInt(uint64(1), 32).
			MustStoreUInt(uint64((i+1)*100), 32). //nolint:gosec // test code
			MustStoreAddr(addr).
			EndCell()

		logs[i] = models.Log{
			FilterID:     filterID,
			ChainID:      "test-chain",
			Address:      addr,
			EventSig:     counter.TopicCountIncreased,
			Data:         eventCell,
			TxHash:       models.TxHash{byte(i + 1), byte(filterID), 3, 4, 5},
			TxLT:         uint64(1000 + i), //nolint:gosec // test code
			MsgLT:        uint64(1000 + i), //nolint:gosec // test code
			TxTimestamp:  baseTime.Add(time.Duration(i) * time.Minute),
			Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: uint32(100 + i)}, //nolint:gosec // test code
			MCBlockSeqno: uint32(200 + i),                                                  //nolint:gosec // test code
			MsgIndex:     int64(i),
		}

		for _, opt := range opts {
			opt(&logs[i])
		}
	}
	return logs
}

// createLogsWithTxLT creates logs with specific TxLT values for testing ordering
func createLogsWithTxLT(t *testing.T, addr *address.Address, filterID int64, txLTs []uint64) []models.Log {
	t.Helper()

	baseTime := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	logs := make([]models.Log, len(txLTs))

	for i, txLT := range txLTs {
		eventCell := cell.BeginCell().
			MustStoreUInt(uint64(1), 32).
			MustStoreUInt(uint64((i+1)*100), 32). //nolint:gosec // test code
			MustStoreAddr(addr).
			EndCell()

		logs[i] = models.Log{
			FilterID:     filterID,
			ChainID:      "test-chain",
			Address:      addr,
			EventSig:     counter.TopicCountIncreased,
			Data:         eventCell,
			TxHash:       models.TxHash{byte(i + 1), byte(filterID), byte(txLT % 256), 4, 5},
			TxLT:         txLT,
			MsgLT:        txLT,
			TxTimestamp:  baseTime.Add(time.Duration(i) * time.Minute),
			Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: uint32(100 + i)}, //nolint:gosec // test code
			MCBlockSeqno: uint32(200 + i),                                                  //nolint:gosec // test code
			MsgIndex:     0,
		}
	}
	return logs
}

// softDeleteFilter marks a filter as deleted using UnregisterFilter
func softDeleteFilter(ctx context.Context, t *testing.T, filterStore logpoller.FilterStore, name string) {
	t.Helper()
	err := filterStore.UnregisterFilter(ctx, name)
	require.NoError(t, err)
}

// TestPruning exercises the complete pruning workflow combining all three pruning types:
// time-based, count-based, and deleted filter cleanup.
func TestPruning(t *testing.T) {
	ctx := t.Context()
	ds := pgtest.SetupTestDB(t)

	err := pgtest.ExecuteSQL(ctx, ds, testdata.CreateLogPollerTables)
	require.NoError(t, err)

	lggr := logger.Test(t)
	orm := postgres.NewORM("test-chain", ds, lggr)
	filterStore := postgres.NewFilterStore("test-chain", orm, lggr)
	logStore := postgres.NewLogStore("test-chain", orm, lggr)

	testAddr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Filter A: time-based pruning (LogRetention=1h, MaxLogsKept=0)
	filterAName := "pruning-A-" + uuid.New().String()
	filterA := models.Filter{
		Name:         filterAName,
		Address:      testAddr,
		MsgType:      tlb.MsgTypeExternalOut,
		EventSig:     counter.TopicCountIncreased,
		LogRetention: 1 * time.Hour,
		MaxLogsKept:  0, // Unlimited
	}
	filterAID, err := filterStore.RegisterFilter(ctx, filterA)
	require.NoError(t, err)

	// Filter B: count-based pruning (LogRetention=0, MaxLogsKept=5)
	filterBName := "pruning-B-" + uuid.New().String()
	filterB := models.Filter{
		Name:         filterBName,
		Address:      testAddr,
		MsgType:      tlb.MsgTypeExternalOut,
		EventSig:     counter.TopicCountIncreased,
		LogRetention: 0, // Keep forever
		MaxLogsKept:  5,
	}
	filterBID, err := filterStore.RegisterFilter(ctx, filterB)
	require.NoError(t, err)

	// Filter C: will be soft-deleted
	filterCName := "pruning-C-" + uuid.New().String()
	filterC := models.Filter{
		Name:        filterCName,
		Address:     testAddr,
		MsgType:     tlb.MsgTypeExternalOut,
		EventSig:    counter.TopicCountIncreased,
		MaxLogsKept: 0,
	}
	filterCID, err := filterStore.RegisterFilter(ctx, filterC)
	require.NoError(t, err)

	// Insert test data
	now := time.Now()
	pastExpiry := now.Add(-2 * time.Hour)
	futureExpiry := now.Add(2 * time.Hour)

	// Filter A: 3 expired + 2 valid logs
	expiredLogsA := createTestLogsForPruning(t, testAddr, filterAID, 3, withExpiresAt(pastExpiry))
	for i := range expiredLogsA {
		expiredLogsA[i].TxLT = uint64(20000 + i)  //nolint:gosec // test code - bounded loop index
		expiredLogsA[i].MsgLT = uint64(20000 + i) //nolint:gosec // test code - bounded loop index
	}
	validLogsA := createTestLogsForPruning(t, testAddr, filterAID, 2, withExpiresAt(futureExpiry))
	for i := range validLogsA {
		validLogsA[i].TxHash[0] = byte(200 + i)
		validLogsA[i].TxLT = uint64(20100 + i)  //nolint:gosec // test code - bounded loop index
		validLogsA[i].MsgLT = uint64(20100 + i) //nolint:gosec // test code - bounded loop index
	}
	_, err = logStore.SaveLogs(ctx, append(expiredLogsA, validLogsA...), logpoller.DefaultConfigSet.BatchInsertSize, logpoller.DefaultConfigSet.MinBatchSize)
	require.NoError(t, err)

	// Filter B: 8 logs (will keep 5 newest)
	logsB := createLogsWithTxLT(t, testAddr, filterBID, []uint64{21000, 21001, 21002, 21003, 21004, 21005, 21006, 21007})
	_, err = logStore.SaveLogs(ctx, logsB, logpoller.DefaultConfigSet.BatchInsertSize, logpoller.DefaultConfigSet.MinBatchSize)
	require.NoError(t, err)

	// Filter C: 4 logs
	logsC := createTestLogsForPruning(t, testAddr, filterCID, 4)
	for i := range logsC {
		logsC[i].TxLT = uint64(22000 + i)  //nolint:gosec // test code - bounded loop index
		logsC[i].MsgLT = uint64(22000 + i) //nolint:gosec // test code - bounded loop index
	}
	_, err = logStore.SaveLogs(ctx, logsC, logpoller.DefaultConfigSet.BatchInsertSize, logpoller.DefaultConfigSet.MinBatchSize)
	require.NoError(t, err)

	// Soft-delete filter C
	softDeleteFilter(ctx, t, filterStore, filterCName)

	// Execute pruning sequence
	expiredDeleted, err := logStore.DeleteExpiredLogs(ctx, 1000)
	require.NoError(t, err)
	assert.Equal(t, int64(3), expiredDeleted, "time-based: should delete 3 expired logs")

	excessDeleted, err := logStore.DeleteExcessLogs(ctx, 1000)
	require.NoError(t, err)
	assert.Equal(t, int64(3), excessDeleted, "count-based: should delete 3 excess logs (8-5)")

	deletedFilterLogs, err := logStore.DeleteLogsForDeletedFilters(ctx, 1000)
	require.NoError(t, err)
	assert.Equal(t, int64(4), deletedFilterLogs, "deleted filter: should delete 4 logs")

	emptyFilters, err := filterStore.DeleteEmptyFilters(ctx)
	require.NoError(t, err)
	assert.Equal(t, int64(1), emptyFilters, "should delete 1 empty filter row")

	// Verify final state
	var countA, countB, countC int64
	err = ds.GetContext(ctx, &countA, "SELECT COUNT(*) FROM ton.log_poller_logs WHERE filter_id = $1", filterAID)
	require.NoError(t, err)
	assert.Equal(t, int64(2), countA, "filter A: 2 non-expired logs remain")

	err = ds.GetContext(ctx, &countB, "SELECT COUNT(*) FROM ton.log_poller_logs WHERE filter_id = $1", filterBID)
	require.NoError(t, err)
	assert.Equal(t, int64(5), countB, "filter B: 5 newest logs remain")

	err = ds.GetContext(ctx, &countC, "SELECT COUNT(*) FROM ton.log_poller_logs WHERE filter_id = $1", filterCID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), countC, "filter C: 0 logs remain")

	existsC, err := filterStore.HasFilter(ctx, filterCName)
	require.NoError(t, err)
	assert.False(t, existsC, "filter C row should be deleted")
}

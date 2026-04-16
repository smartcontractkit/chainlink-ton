package logpoller

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/integration-tests/logpoller/testdata"
	pgtest "github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/postgres"
	tontest "github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/postgres"
)

// createTestLogs creates sample logs for testing with actual Counter events
func createTestLogs(t *testing.T, addr *address.Address, filterID int64) []models.Log {
	t.Helper()
	logs := make([]models.Log, 3)

	for i := range 3 {
		// Create CountIncreased event: ID (32) + Value (32) + Sender (address)
		counterID := uint32(1) // Fixed ID
		counterValue := uint32((i + 1) * 100)

		// Create CountIncreased event cell: ID(32) + Value(32) + Address
		// NOTE: Parser extracts opcode from message and stores only the body
		// So we create just the event data (without opcode)
		eventCell := cell.BeginCell().
			MustStoreUInt(uint64(counterID), 32).    // ID
			MustStoreUInt(uint64(counterValue), 32). // Value
			MustStoreAddr(addr).                     // Sender address
			EndCell()

		logs[i] = models.Log{
			FilterID:     filterID,
			ChainID:      "test-chain",
			Address:      addr,
			EventSig:     counter.TopicCountIncreased,
			Data:         eventCell,
			TxHash:       models.TxHash{byte(i + 1), 2, 3, 4, 5},
			TxLT:         uint64(1000 + i),
			MsgLT:        uint64(1000 + i),
			TxTimestamp:  time.Now().Add(time.Duration(i) * time.Minute),
			Block:        tontest.TestBlockIDExt(uint32(100 + i)),
			MCBlockSeqno: uint32(200 + i),
			MsgIndex:     int64(i),
		}
	}
	return logs
}

func TestPgLogStore(t *testing.T) {
	ctx := t.Context()
	ds := pgtest.SetupTestDB(t)

	// Create tables
	err := pgtest.ExecuteSQL(ctx, ds, testdata.CreateLogPollerTables)
	require.NoError(t, err)

	// Create stores
	orm := postgres.NewORM("test-chain", ds, logger.Test(t))

	filterStore := postgres.NewFilterStore("test-chain", orm, logger.Test(t))
	logStore := postgres.NewLogStore("test-chain", orm, logger.Test(t))

	// Test data setup
	testAddr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	// Register a filter first
	filter := models.Filter{
		Name:          "test-filter",
		Address:       testAddr,
		MsgType:       tlb.MsgTypeExternalOut,
		EventSig:      counter.TopicCountIncreased,
		StartingSeqNo: 0,
	}

	filterID, err := filterStore.RegisterFilter(ctx, filter)
	require.NoError(t, err)
	require.Positive(t, filterID)

	// Create test logs with the actual filterID
	testLogs := createTestLogs(t, testAddr, filterID)

	// SaveLogs test
	savedCount, err := logStore.SaveLogs(ctx, testLogs, logpoller.DefaultConfigSet.BatchInsertSize, logpoller.DefaultConfigSet.MinBatchSize)
	require.NoError(t, err)
	require.Equal(t, int64(len(testLogs)), savedCount)

	logs, hasMore, nextCursor, err := logStore.QueryLogs(ctx, &query.LogQuery{
		FieldFilters: []*query.FieldFilter{
			{
				Field:    "address",
				Operator: primitives.Eq,
				Value:    testAddr,
			},
			{
				Field:    "event_sig",
				Operator: primitives.Eq,
				Value:    counter.TopicCountIncreased,
			},
		},
		LimitAndSort: commonquery.LimitAndSort{
			Limit: commonquery.CountLimit(10), // Set a reasonable limit
		},
	})
	require.NoError(t, err)

	// Check the raw query result
	assert.Len(t, logs, 3)
	assert.False(t, hasMore)    // Should be false since we got less than limit
	assert.Empty(t, nextCursor) // Should be empty since no more data

	t.Run("QueryLogs - With Limit", func(t *testing.T) {
		limitAndSort := commonquery.LimitAndSort{
			Limit: commonquery.CountLimit(2),
		}

		logs, hasMore, nextCursor, err := logStore.QueryLogs(ctx, &query.LogQuery{
			FieldFilters: []*query.FieldFilter{
				{
					Field:    "address",
					Operator: primitives.Eq,
					Value:    testAddr,
				},
				{
					Field:    "event_sig",
					Operator: primitives.Eq,
					Value:    counter.TopicCountIncreased,
				},
			},
			LimitAndSort: limitAndSort,
		})
		require.NoError(t, err)

		// Check raw query result directly
		assert.Len(t, logs, 2)
		assert.True(t, hasMore)
		assert.NotEmpty(t, nextCursor)
	})

	t.Run("QueryLogs - With Sorting", func(t *testing.T) {
		// Test TxLT sorting (DESC)
		logs, _, _, err := logStore.QueryLogs(ctx, &query.LogQuery{
			FieldFilters: []*query.FieldFilter{
				{Field: "address", Operator: primitives.Eq, Value: testAddr},
				{Field: "event_sig", Operator: primitives.Eq, Value: counter.TopicCountIncreased},
			},
			LimitAndSort: commonquery.LimitAndSort{
				SortBy: []commonquery.SortBy{query.NewTxLTSort(commonquery.Desc)},
			},
		})
		require.NoError(t, err)
		assert.Len(t, logs, 3)

		// Verify descending order by TxLT
		for i := 1; i < len(logs); i++ {
			assert.GreaterOrEqual(t, logs[i-1].TxLT, logs[i].TxLT)
		}

		// Test timestamp sorting with tiebreakers (same timestamp, different tx_lt)
		sameTimestamp := time.Now().Truncate(time.Second)
		collisionLogs := make([]models.Log, 3)
		for i := range 3 {
			eventCell := cell.BeginCell().
				MustStoreUInt(uint64(1), 32).
				MustStoreUInt(uint64((i+1)*1000), 32).
				MustStoreAddr(testAddr).
				EndCell()

			collisionLogs[i] = models.Log{
				FilterID:     filterID,
				ChainID:      "test-chain",
				Address:      testAddr,
				EventSig:     counter.TopicCountIncreased,
				Data:         eventCell,
				TxHash:       models.TxHash{byte(i + 10), 2, 3, 4, 5},
				TxLT:         uint64(5000 - i),
				MsgLT:        uint64(5000 - i),
				TxTimestamp:  sameTimestamp,
				Block:        tontest.TestBlockIDExt(uint32(500 + i)),
				MCBlockSeqno: uint32(600 + i),
				MsgIndex:     int64(i),
			}
		}
		_, err = logStore.SaveLogs(ctx, collisionLogs, logpoller.DefaultConfigSet.BatchInsertSize, logpoller.DefaultConfigSet.MinBatchSize)
		require.NoError(t, err)

		// Query with timestamp sort ASC - tx_lt used as tiebreaker
		tsLogs, _, _, err := logStore.QueryLogs(ctx, &query.LogQuery{
			FieldFilters: []*query.FieldFilter{
				{Field: "address", Operator: primitives.Eq, Value: testAddr},
				{Field: "event_sig", Operator: primitives.Eq, Value: counter.TopicCountIncreased},
				{Field: "tx_timestamp", Operator: primitives.Eq, Value: sameTimestamp},
			},
			LimitAndSort: commonquery.LimitAndSort{
				SortBy: []commonquery.SortBy{query.NewTimestampSort(commonquery.Asc)},
			},
		})
		require.NoError(t, err)
		require.Len(t, tsLogs, 3)

		// Verify deterministic order by tx_lt ASC when timestamps equal
		assert.Equal(t, uint64(4998), tsLogs[0].TxLT)
		assert.Equal(t, uint64(4999), tsLogs[1].TxLT)
		assert.Equal(t, uint64(5000), tsLogs[2].TxLT)
	})

	t.Run("QueryLogs - With Byte Filters", func(t *testing.T) {
		// Filter for logs with counter value = 200 (second log)
		// Based on BOC analysis: Value field is at offset 4 in the cell payload
		// (17 in full BOC - 13 BOC header = 4 in cell payload)
		byteFilters := []*query.ByteFilter{
			{
				Offset: 4, // Offset where Value field appears in cell payload (after BOC header)
				Size:   4, // 4 bytes for uint32 Value
				Conditions: []query.Condition{
					query.WithCondition([]byte{0x00, 0x00, 0x00, 0xc8}, primitives.Eq), // 200 = 0xc8 in hex
				},
			},
		}

		logs, _, _, err := logStore.QueryLogs(ctx, &query.LogQuery{
			FieldFilters: []*query.FieldFilter{
				{
					Field:    "address",
					Operator: primitives.Eq,
					Value:    testAddr,
				},
				{
					Field:    "event_sig",
					Operator: primitives.Eq,
					Value:    counter.TopicCountIncreased,
				},
			},
			ByteFilters:  byteFilters,
			LimitAndSort: commonquery.LimitAndSort{},
		})
		require.NoError(t, err)

		// Should match exactly 1 log (the one with Value=200)
		assert.Len(t, logs, 1)
		assert.Equal(t, uint64(1001), logs[0].TxLT) // Second log
	})

	t.Run("QueryLogs - Cursor Pagination", func(t *testing.T) {
		// First page
		limitAndSort := commonquery.LimitAndSort{
			Limit:  commonquery.CountLimit(1),
			SortBy: []commonquery.SortBy{query.NewTxLTSort(commonquery.Asc)},
		}

		firstLogs, hasMore, nextCursor, err := logStore.QueryLogs(ctx, &query.LogQuery{
			FieldFilters: []*query.FieldFilter{
				{
					Field:    "address",
					Operator: primitives.Eq,
					Value:    testAddr,
				},
				{
					Field:    "event_sig",
					Operator: primitives.Eq,
					Value:    counter.TopicCountIncreased,
				},
			},
			LimitAndSort: limitAndSort,
		})
		require.NoError(t, err)

		// Check first page raw query result
		require.Len(t, firstLogs, 1)
		require.True(t, hasMore)

		// Second page using cursor
		limitAndSort.Limit = commonquery.CursorLimit(nextCursor, commonquery.CursorFollowing, 1)
		logs2, _, _, err := logStore.QueryLogs(ctx, &query.LogQuery{
			FieldFilters: []*query.FieldFilter{
				{
					Field:    "address",
					Operator: primitives.Eq,
					Value:    testAddr,
				},
				{
					Field:    "event_sig",
					Operator: primitives.Eq,
					Value:    counter.TopicCountIncreased,
				},
			},
			LimitAndSort: limitAndSort,
		})
		require.NoError(t, err)

		// Check second page raw query result
		require.Len(t, logs2, 1)

		// Verify different logs (use TxLT since ID is not in SELECT)
		assert.NotEqual(t, firstLogs[0].TxLT, logs2[0].TxLT)
		assert.Less(t, firstLogs[0].TxLT, logs2[0].TxLT)
	})
}

func TestGetLatestBlock(t *testing.T) {
	t.Parallel()
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

	filterID, err := filterStore.RegisterFilter(ctx, models.Filter{
		Name:     "test-filter",
		Address:  testAddr,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: counter.TopicCountIncreased,
	})
	require.NoError(t, err)

	// helper to create log with specific mc block seqno
	makeLog := func(idx int, mcSeqno uint32) models.Log {
		return models.Log{
			ChainID:      "test-chain",
			FilterID:     filterID,
			Address:      testAddr,
			EventSig:     counter.TopicCountIncreased,
			Data:         cell.BeginCell().MustStoreUInt(1, 32).MustStoreUInt(uint64(idx*100), 32).MustStoreAddr(testAddr).EndCell(), //nolint:gosec // test code
			TxHash:       models.TxHash{byte(idx), 0, 0},                                                                             //nolint:gosec // G115 - TODO(lint-migration): golangci-lint 2.11 rule tightened
			TxLT:         uint64(1000 + idx),                                                                                         //nolint:gosec // test code
			MsgLT:        uint64(1000 + idx),                                                                                         //nolint:gosec // test code
			TxTimestamp:  time.Now(),
			Block:        tontest.TestBlockIDExt(uint32(100 + idx)), //nolint:gosec // test code
			MCBlockSeqno: mcSeqno,
			MsgIndex:     int64(idx),
		}
	}

	tests := []struct {
		name     string
		logs     []models.Log
		expected uint32
	}{
		{
			name:     "empty database returns 0",
			logs:     nil,
			expected: 0,
		},
		{
			name:     "single log",
			logs:     []models.Log{makeLog(1, 5000)},
			expected: 5000,
		},
		{
			name:     "multiple logs returns highest",
			logs:     []models.Log{makeLog(2, 5500), makeLog(3, 6000)},
			expected: 6000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if len(tt.logs) > 0 {
				_, err := logStore.SaveLogs(ctx, tt.logs, logpoller.DefaultConfigSet.BatchInsertSize, logpoller.DefaultConfigSet.MinBatchSize)
				require.NoError(t, err)
			}

			latestBlock, _, err := logStore.GetHighestMCBlockSeqno(ctx)
			require.NoError(t, err)
			assert.Equal(t, tt.expected, latestBlock)
		})
	}
}

func TestMultiFilterDeduplication(t *testing.T) {
	t.Parallel()
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

	// Register 3 filters tracking the SAME (address, event_sig)
	filterIDs := make([]int64, 3)
	for i := range 3 {
		filterID, ferr := filterStore.RegisterFilter(ctx, models.Filter{
			Name:     fmt.Sprintf("filter-%d", i),
			Address:  testAddr,
			MsgType:  tlb.MsgTypeExternalOut,
			EventSig: counter.TopicCountIncreased,
		})
		require.NoError(t, ferr)
		filterIDs[i] = filterID
	}

	// Create 2 unique blockchain events
	const numEvents = 2
	baseTime := time.Now().Truncate(time.Second)

	// Insert each event once per filter (2 events × 3 filters = 6 rows)
	var totalInserted int64
	for eventIdx := range numEvents {
		eventCell := cell.BeginCell().
			MustStoreUInt(1, 32).
			MustStoreUInt(uint64((eventIdx+1)*100), 32).
			MustStoreAddr(testAddr).
			EndCell()

		for _, filterID := range filterIDs {
			log := models.Log{
				FilterID:     filterID,
				ChainID:      "test-chain",
				Address:      testAddr,
				EventSig:     counter.TopicCountIncreased,
				Data:         eventCell,
				TxHash:       models.TxHash{byte(eventIdx + 1), 2, 3, 4, 5},
				TxLT:         uint64(1000 + eventIdx),
				MsgLT:        uint64(1000 + eventIdx),
				TxTimestamp:  baseTime.Add(time.Duration(eventIdx) * time.Minute),
				Block:        tontest.TestBlockIDExt(uint32(100 + eventIdx)),
				MCBlockSeqno: uint32(200 + eventIdx),
				MsgIndex:     int64(eventIdx),
			}
			inserted, ierr := logStore.SaveLogs(ctx, []models.Log{log}, logpoller.DefaultConfigSet.BatchInsertSize, logpoller.DefaultConfigSet.MinBatchSize)
			require.NoError(t, ierr)
			totalInserted += inserted
		}
	}

	// Verify: 6 rows stored in DB (2 events × 3 filters)
	assert.Equal(t, int64(6), totalInserted, "expected 6 rows inserted (2 events × 3 filters)")

	// Verify: QueryLogs returns 2 deduplicated results
	logs, _, _, err := logStore.QueryLogs(ctx, &query.LogQuery{
		FieldFilters: []*query.FieldFilter{
			{Field: "address", Operator: primitives.Eq, Value: testAddr},
			{Field: "event_sig", Operator: primitives.Eq, Value: counter.TopicCountIncreased},
		},
		LimitAndSort: commonquery.LimitAndSort{},
	})
	require.NoError(t, err)
	assert.Len(t, logs, numEvents, "expected %d deduplicated logs, got %d", numEvents, len(logs))

	// Verify each returned log has unique (TxHash, TxLT, MsgIndex)
	seen := make(map[string]struct{})
	for _, log := range logs {
		key := fmt.Sprintf("%x-%d-%d", log.TxHash[:], log.TxLT, log.MsgIndex)
		assert.NotContains(t, seen, key, "duplicate log found")
		seen[key] = struct{}{}
	}
}

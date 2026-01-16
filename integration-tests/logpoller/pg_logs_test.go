package logpoller

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	commonquery "github.com/smartcontractkit/chainlink-common/pkg/types/query"
	"github.com/smartcontractkit/chainlink-common/pkg/types/query/primitives"

	"github.com/smartcontractkit/chainlink-ton/integration-tests/logpoller/testdata"
	pgtest "github.com/smartcontractkit/chainlink-ton/integration-tests/testutils/postgres"
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
		counterID := uint32(1)                // Fixed ID
		counterValue := uint32((i + 1) * 100) //nolint:gosec // test code with small values

		// Create CountIncreased event cell: ID(32) + Value(32) + Address
		// NOTE: Parser extracts opcode from message and stores only the body
		// So we create just the event data (without opcode)
		eventCell := cell.BeginCell().
			MustStoreUInt(uint64(counterID), 32).    // ID
			MustStoreUInt(uint64(counterValue), 32). // Value
			MustStoreAddr(addr).                     // Sender address
			EndCell()

		logs[i] = models.Log{
			FilterID:    filterID,
			ChainID:     "test-chain",
			Address:     addr,
			EventSig:    counter.TopicCountIncreased,
			Data:        eventCell,
			TxHash:      models.TxHash{byte(i + 1), 2, 3, 4, 5},
			TxLT:        uint64(1000 + i), //nolint:gosec // test code with small values
			MsgLT:       uint64(1000 + i), //nolint:gosec // test code with small values - same as TxLT for simplicity
			TxTimestamp: time.Now().Add(time.Duration(i) * time.Minute),
			Block: &ton.BlockIDExt{
				Workchain: 0,
				Shard:     -1,
				SeqNo:     uint32(100 + i), //nolint:gosec // test code with small values
			},
			MasterBlockSeqno: uint32(200 + i), //nolint:gosec // test code with small values
			MsgIndex:         int64(i),
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
				MustStoreUInt(uint64((i+1)*1000), 32). //nolint:gosec // test code with small values
				MustStoreAddr(testAddr).
				EndCell()

			collisionLogs[i] = models.Log{
				FilterID:         filterID,
				ChainID:          "test-chain",
				Address:          testAddr,
				EventSig:         counter.TopicCountIncreased,
				Data:             eventCell,
				TxHash:           models.TxHash{byte(i + 10), 2, 3, 4, 5},
				TxLT:             uint64(5000 - i), //nolint:gosec // test code with small values
				MsgLT:            uint64(5000 - i), //nolint:gosec // test code with small values
				TxTimestamp:      sameTimestamp,
				Block:            &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: uint32(500 + i)}, //nolint:gosec // test code
				MasterBlockSeqno: uint32(600 + i),                                                  //nolint:gosec // test code
				MsgIndex:         int64(i),
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

		// Verify different logs
		assert.NotEqual(t, firstLogs[0].ID, logs2[0].ID)
		assert.Less(t, firstLogs[0].TxLT, logs2[0].TxLT)
	})
}

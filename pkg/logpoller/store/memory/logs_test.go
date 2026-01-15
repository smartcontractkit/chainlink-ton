package inmemory

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

func TestSaveLogs_Deduplication(t *testing.T) {
	t.Parallel()

	testAddr := address.MustParseAddr("EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA")
	testCell := cell.BeginCell().MustStoreUInt(0x12345678, 32).EndCell()
	testBlock := &ton.BlockIDExt{SeqNo: 100}
	testChainID := "test-chain"

	createLog := func(filterID int64, txHash models.TxHash, txLT uint64, msgIndex int64) models.Log {
		return models.Log{
			ChainID:     testChainID,
			FilterID:    filterID,
			EventSig:    0x12345678,
			Address:     testAddr,
			Data:        testCell,
			TxHash:      txHash,
			TxLT:        txLT,
			TxTimestamp: time.Now(),
			Block:       testBlock,
			MsgLT:       txLT,
			MsgIndex:    msgIndex,
		}
	}

	t.Run("allows same event with different filter_ids", func(t *testing.T) {
		t.Parallel()

		store := NewLogStore(testChainID, logger.Nop())

		// Same blockchain event (same tx_hash, tx_lt, msg_index) but different filter_ids
		// Each filter should store its own copy of the event
		txHash := models.TxHash{1, 2, 3, 4, 5}
		txLT := uint64(1000)
		msgIndex := int64(0)

		log1 := createLog(100, txHash, txLT, msgIndex) // filter_id = 100
		log2 := createLog(200, txHash, txLT, msgIndex) // filter_id = 200 (same event, different filter)
		log3 := createLog(300, txHash, txLT, msgIndex) // filter_id = 300 (same event, different filter)

		// Insert all logs - each filter should store its own copy
		inserted, err := store.SaveLogs(t.Context(), []models.Log{log1, log2, log3}, 100, 10)
		require.NoError(t, err)
		assert.Equal(t, int64(3), inserted, "all three logs should be inserted (different filter_ids)")

		// Verify all logs were stored
		memStore := store.(*inMemoryLogs)
		assert.Len(t, memStore.logs, 3, "should have three logs stored")
	})

	t.Run("deduplicates by filter_id, tx_hash, tx_lt, msg_index", func(t *testing.T) {
		t.Parallel()

		store := NewLogStore(testChainID, logger.Nop())

		// Exact same log (same filter_id, tx_hash, tx_lt, msg_index)
		txHash := models.TxHash{1, 2, 3, 4, 5}
		txLT := uint64(1000)
		msgIndex := int64(0)
		filterID := int64(100)

		log1 := createLog(filterID, txHash, txLT, msgIndex)
		log2 := createLog(filterID, txHash, txLT, msgIndex) // exact duplicate

		// Insert first log
		inserted1, err := store.SaveLogs(t.Context(), []models.Log{log1}, 100, 10)
		require.NoError(t, err)
		assert.Equal(t, int64(1), inserted1, "first log should be inserted")

		// Try to insert exact duplicate - should be skipped
		inserted2, err := store.SaveLogs(t.Context(), []models.Log{log2}, 100, 10)
		require.NoError(t, err)
		assert.Equal(t, int64(0), inserted2, "duplicate log should be skipped")

		// Verify only one log was stored
		memStore := store.(*inMemoryLogs)
		assert.Len(t, memStore.logs, 1, "should only have one log stored")
	})

	t.Run("allows different events (different tx_hash)", func(t *testing.T) {
		t.Parallel()

		store := NewLogStore(testChainID, logger.Nop())

		txLT := uint64(1000)
		msgIndex := int64(0)

		log1 := createLog(100, models.TxHash{1, 1, 1}, txLT, msgIndex)
		log2 := createLog(100, models.TxHash{2, 2, 2}, txLT, msgIndex) // different tx_hash

		inserted, err := store.SaveLogs(t.Context(), []models.Log{log1, log2}, 100, 10)
		require.NoError(t, err)
		assert.Equal(t, int64(2), inserted, "both logs should be inserted (different tx_hash)")
	})

	t.Run("allows different events (different tx_lt)", func(t *testing.T) {
		t.Parallel()

		store := NewLogStore(testChainID, logger.Nop())

		txHash := models.TxHash{1, 2, 3}
		msgIndex := int64(0)

		log1 := createLog(100, txHash, 1000, msgIndex)
		log2 := createLog(100, txHash, 2000, msgIndex) // different tx_lt

		inserted, err := store.SaveLogs(t.Context(), []models.Log{log1, log2}, 100, 10)
		require.NoError(t, err)
		assert.Equal(t, int64(2), inserted, "both logs should be inserted (different tx_lt)")
	})

	t.Run("allows different events (different msg_index)", func(t *testing.T) {
		t.Parallel()

		store := NewLogStore(testChainID, logger.Nop())

		txHash := models.TxHash{1, 2, 3}
		txLT := uint64(1000)

		log1 := createLog(100, txHash, txLT, 0)
		log2 := createLog(100, txHash, txLT, 1) // different msg_index

		inserted, err := store.SaveLogs(t.Context(), []models.Log{log1, log2}, 100, 10)
		require.NoError(t, err)
		assert.Equal(t, int64(2), inserted, "both logs should be inserted (different msg_index)")
	})

	t.Run("validates chain_id", func(t *testing.T) {
		t.Parallel()

		store := NewLogStore(testChainID, logger.Nop())

		log := createLog(100, models.TxHash{1, 2, 3}, 1000, 0)
		log.ChainID = "wrong-chain" // different chain_id

		_, err := store.SaveLogs(t.Context(), []models.Log{log}, 100, 10)
		require.Error(t, err, "should reject log with wrong chain_id")
		assert.Contains(t, err.Error(), "invalid chainID")
	})
}

// TestLogKeyMatchesDBConstraint verifies the in-memory deduplication key behavior.
func TestLogKeyMatchesDBConstraint(t *testing.T) {
	t.Parallel()

	key1 := logKey{
		filterID: 100,
		txHash:   "abc123",
		txLT:     1000,
		msgIndex: 0,
	}

	key2 := logKey{
		filterID: 100,
		txHash:   "abc123",
		txLT:     1000,
		msgIndex: 0,
	}

	key3 := logKey{
		filterID: 200, // different filter_id
		txHash:   "abc123",
		txLT:     1000,
		msgIndex: 0,
	}

	key4 := logKey{
		filterID: 100,
		txHash:   "def456", // different tx_hash
		txLT:     1000,
		msgIndex: 0,
	}

	// Same key should be equal
	assert.Equal(t, key1, key2, "identical keys should be equal")

	// Different filter_id should be different (allows multiple filters per event)
	assert.NotEqual(t, key1, key3, "different filter_id should create different key")

	// Different tx_hash should be different
	assert.NotEqual(t, key1, key4, "different tx_hash should create different key")
}

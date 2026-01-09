package inmemory

import (
	"context"
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

func TestInMemoryLogs_GetHighestMCBlockSeqno(t *testing.T) {
	ctx := context.Background()
	lggr := logger.Test(t)
	store := NewLogStore("test-chain", lggr)

	testAddr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)

	t.Run("empty store returns 0 and exists=false", func(t *testing.T) {
		latestSeqno, exists, err := store.GetHighestMCBlockSeqno(ctx)
		require.NoError(t, err)
		assert.Equal(t, uint32(0), latestSeqno)
		assert.False(t, exists, "exists should be false for empty store")
	})

	t.Run("returns highest master block seqno with exists=true", func(t *testing.T) {
		// Create test logs with different MCBlockSeqno values
		logs := []models.Log{
			{
				ChainID:      "test-chain",
				FilterID:     1,
				Address:      testAddr,
				EventSig:     0x12345678,
				Data:         cell.BeginCell().EndCell(),
				TxHash:       models.TxHash{1, 2, 3},
				TxLT:         1000,
				MsgLT:        1000,
				TxTimestamp:  time.Now(),
				Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 100},
				MCBlockSeqno: 150,
				MsgIndex:     0,
			},
			{
				ChainID:      "test-chain",
				FilterID:     1,
				Address:      testAddr,
				EventSig:     0x12345678,
				Data:         cell.BeginCell().EndCell(),
				TxHash:       models.TxHash{1, 2, 4},
				TxLT:         1001,
				MsgLT:        1001,
				TxTimestamp:  time.Now(),
				Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 101},
				MCBlockSeqno: 200, // highest
				MsgIndex:     0,
			},
			{
				ChainID:      "test-chain",
				FilterID:     1,
				Address:      testAddr,
				EventSig:     0x12345678,
				Data:         cell.BeginCell().EndCell(),
				TxHash:       models.TxHash{1, 2, 5},
				TxLT:         1002,
				MsgLT:        1002,
				TxTimestamp:  time.Now(),
				Block:        &ton.BlockIDExt{Workchain: 0, Shard: -1, SeqNo: 102},
				MCBlockSeqno: 175,
				MsgIndex:     0,
			},
		}

		_, err := store.SaveLogs(ctx, logs, 100, 10)
		require.NoError(t, err)

		latestSeqno, exists, err := store.GetHighestMCBlockSeqno(ctx)
		require.NoError(t, err)
		assert.Equal(t, uint32(200), latestSeqno)
		assert.True(t, exists, "exists should be true after saving logs")
	})
}

package logpoller

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
)

// mockAPIClient is a minimal mock for ton.APIClientWrapped used in unit tests
type mockAPIClient struct {
	ton.APIClientWrapped // embed to satisfy interface
	masterchainInfo      *ton.BlockIDExt
	masterchainErr       error
	lookupBlockResult    *ton.BlockIDExt
	lookupBlockErr       error
	lookupBlockFunc      func(seqNo uint32) *ton.BlockIDExt // optional: dynamic block lookup
}

func (m *mockAPIClient) CurrentMasterchainInfo(_ context.Context) (*ton.BlockIDExt, error) {
	return m.masterchainInfo, m.masterchainErr
}

func (m *mockAPIClient) LookupBlock(_ context.Context, _ int32, _ int64, seqNo uint32) (*ton.BlockIDExt, error) {
	if m.lookupBlockFunc != nil {
		return m.lookupBlockFunc(seqNo), m.lookupBlockErr
	}
	return m.lookupBlockResult, m.lookupBlockErr
}

func TestGetMasterchainCurrentBlock_WorkchainValidation(t *testing.T) {
	t.Parallel()

	t.Run("rejects non-masterchain workchain", func(t *testing.T) {
		t.Parallel()
		mock := &mockAPIClient{
			masterchainInfo: &ton.BlockIDExt{Workchain: 0, SeqNo: 100}, // workchain 0 is base chain, not masterchain
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}

		_, err := lp.getMasterchainCurrentBlock(context.Background())
		require.Error(t, err)
		require.Contains(t, err.Error(), "expected masterchain block")
	})

	t.Run("accepts masterchain workchain", func(t *testing.T) {
		t.Parallel()
		mock := &mockAPIClient{
			masterchainInfo: &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100},
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}

		block, err := lp.getMasterchainCurrentBlock(context.Background())
		require.NoError(t, err)
		require.NotNil(t, block)
		require.Equal(t, uint32(100), block.SeqNo)
	})
}

func TestGetBlockRange(t *testing.T) {
	t.Parallel()

	t.Run("returns nil when no new blocks", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{}, nil
			},
			lastProcessedBlockSeqNo: 100, // same as SeqNo, so no new blocks
		}

		blockRange, err := lp.getBlockRange(context.Background(), currentMasterchainBlock)
		require.NoError(t, err)
		require.Nil(t, blockRange, "no new blocks when seqno matches lastProcessedBlockSeqNo")
	})
}

func TestComputeLookbackWindow(t *testing.T) {
	t.Parallel()

	t.Run("basic lookback calculation", func(t *testing.T) {
		t.Parallel()
		currentSeqNo := uint32(1000)
		lookbackDuration := 50 * time.Second // Go back 50 seconds
		blockTime := 2500 * time.Millisecond // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(50s / 2.5s) = ceil(20) = 20 blocks back, so 1000 - 20 = 980
		expected := uint32(980)
		require.Equal(t, expected, result)
	})

	t.Run("lookback with ceiling division", func(t *testing.T) {
		t.Parallel()
		currentSeqNo := uint32(1000)
		lookbackDuration := 51 * time.Second // Go back 51 seconds (not evenly divisible)
		blockTime := 2500 * time.Millisecond // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(51s / 2.5s) = ceil(20.4) = 21 blocks back, so 1000 - 21 = 979
		expected := uint32(979)
		require.Equal(t, expected, result)
	})

	t.Run("lookback exceeds chain history", func(t *testing.T) {
		t.Parallel()
		currentSeqNo := uint32(5)
		lookbackDuration := 100 * time.Second // Go back 100 seconds
		blockTime := 2500 * time.Millisecond  // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(100s / 2.5s) = ceil(40) = 40 blocks back, but currentSeqNo (5) < 40, so return 0
		expected := uint32(0)
		require.Equal(t, expected, result, "should return 0 when lookback exceeds chain history")
	})

	t.Run("with default config", func(t *testing.T) {
		t.Parallel()
		currentSeqNo := uint32(50000)
		lookbackDuration := DefaultConfigSet.LogPollerStartingLookback.Duration() // 24 hours
		blockTime := DefaultConfigSet.BlockTime.Duration()                        // 2.5 seconds

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(24h / 2.5s) = ceil(86400s / 2.5s) = ceil(34560) = 34560 blocks back, so 50000 - 34560 = 15440
		expected := uint32(15440)
		require.Equal(t, expected, result)
	})
}

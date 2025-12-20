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
}

func (m *mockAPIClient) CurrentMasterchainInfo(_ context.Context) (*ton.BlockIDExt, error) {
	return m.masterchainInfo, m.masterchainErr
}

func TestGetMasterchainBlockRange_WorkchainValidation(t *testing.T) {
	t.Run("rejects non-masterchain workchain", func(t *testing.T) {
		mock := &mockAPIClient{
			masterchainInfo: &ton.BlockIDExt{Workchain: 0, SeqNo: 100}, // workchain 0 is base chain, not masterchain
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}

		_, err := lp.getMasterchainBlockRange(context.Background())
		require.Error(t, err)
	})

	t.Run("accepts masterchain workchain", func(t *testing.T) {
		mock := &mockAPIClient{
			masterchainInfo: &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100},
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
			lastProcessedBlock: 100, // same as SeqNo, so no new blocks
		}

		// should return nil (no new blocks) without error
		blockRange, err := lp.getMasterchainBlockRange(context.Background())
		require.NoError(t, err)
		require.Nil(t, blockRange, "no new blocks when seqno matches lastProcessedBlock")
	})
}

func TestComputeLookbackWindow(t *testing.T) {
	t.Run("Basic lookback calculation", func(t *testing.T) {
		currentSeqNo := uint32(1000)
		lookbackDuration := 50 * time.Second // Go back 50 seconds
		blockTime := 2500 * time.Millisecond // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(50s / 2.5s) = ceil(20) = 20 blocks back, so 1000 - 20 = 980
		expected := uint32(980)
		require.Equal(t, expected, result)
	})

	t.Run("Lookback with ceiling division", func(t *testing.T) {
		currentSeqNo := uint32(1000)
		lookbackDuration := 51 * time.Second // Go back 51 seconds (not evenly divisible)
		blockTime := 2500 * time.Millisecond // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(51s / 2.5s) = ceil(20.4) = 21 blocks back, so 1000 - 21 = 979
		expected := uint32(979)
		require.Equal(t, expected, result)
	})

	t.Run("Lookback exceeds chain history", func(t *testing.T) {
		currentSeqNo := uint32(5)
		lookbackDuration := 100 * time.Second // Go back 100 seconds
		blockTime := 2500 * time.Millisecond  // 2.5 second block time

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(100s / 2.5s) = ceil(40) = 40 blocks back, but currentSeqNo (5) < 40, so return 0
		expected := uint32(0)
		require.Equal(t, expected, result, "should return 0 when lookback exceeds chain history")
	})

	t.Run("With default config", func(t *testing.T) {
		currentSeqNo := uint32(50000)
		lookbackDuration := DefaultConfigSet.LogPollerStartingLookback.Duration() // 24 hours
		blockTime := DefaultConfigSet.BlockTime.Duration()                        // 2.5 seconds

		result := computeLookbackWindow(currentSeqNo, lookbackDuration, blockTime)

		// ceil(24h / 2.5s) = ceil(86400s / 2.5s) = ceil(34560) = 34560 blocks back, so 50000 - 34560 = 15440
		expected := uint32(15440)
		require.Equal(t, expected, result)
	})
}

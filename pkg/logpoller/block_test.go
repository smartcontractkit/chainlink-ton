package logpoller

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// mockAPIClient is a minimal mock for ton.APIClientWrapped used in unit tests
type mockAPIClient struct {
	ton.APIClientWrapped // embed to satisfy interface
	masterchainInfo      *ton.BlockIDExt
	masterchainErr       error
	lookupBlockResult    *ton.BlockIDExt
	lookupBlockErr       error
}

func (m *mockAPIClient) CurrentMasterchainInfo(_ context.Context) (*ton.BlockIDExt, error) {
	return m.masterchainInfo, m.masterchainErr
}

func (m *mockAPIClient) LookupBlock(_ context.Context, _ int32, _ int64, _ uint32) (*ton.BlockIDExt, error) {
	return m.lookupBlockResult, m.lookupBlockErr
}

func TestGetCurrentMasterchainBlock_WorkchainValidation(t *testing.T) {
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

		_, err := lp.getCurrentBlock(context.Background())
		require.Error(t, err)
		require.Contains(t, err.Error(), "expected masterchain block")
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
		}

		block, err := lp.getCurrentBlock(context.Background())
		require.NoError(t, err)
		require.NotNil(t, block)
		require.Equal(t, uint32(100), block.SeqNo)
	})
}

func TestGetMasterchainBlockRange(t *testing.T) {
	t.Run("returns nil when no new blocks", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{}, nil
			},
			lastProcessedBlock: 100, // same as SeqNo, so no new blocks
		}

		blockRange, err := lp.getBlockRange(context.Background(), currentBlock)
		require.NoError(t, err)
		require.Nil(t, blockRange, "no new blocks when seqno matches lastProcessedBlock")
	})
}

func TestApplyReplayOverride(t *testing.T) {
	t.Run("no replay request returns original blockRange", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100}
		originalRange := &models.BlockRange{
			Prev: &ton.BlockIDExt{SeqNo: 90},
			To:   currentBlock,
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{}, nil
			},
		}
		lp.replay.status = models.ReplayStatusNoRequest

		result := lp.applyReplayOverride(originalRange, currentBlock)
		require.Same(t, originalRange, result)
	})

	t.Run("idle chain with replay constructs new blockRange", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = replayBlock

		// blockRange is nil (chain is idle)
		result := lp.applyReplayOverride(nil, currentBlock)
		require.NotNil(t, result, "should construct block range for idle chain replay")
		require.Equal(t, uint32(50), result.FromSeqNo())
		require.Equal(t, uint32(100), result.ToSeqNo())
		require.Equal(t, models.ReplayStatusPending, lp.replay.status)
	})

	t.Run("replay overrides existing blockRange", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		originalRange := &models.BlockRange{
			Prev: &ton.BlockIDExt{SeqNo: 90},
			To:   currentBlock,
		}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = replayBlock

		result := lp.applyReplayOverride(originalRange, currentBlock)
		require.Same(t, originalRange, result)
		require.Equal(t, uint32(50), result.FromSeqNo(), "should override starting block")
		require.Equal(t, uint32(100), result.ToSeqNo())
	})

	t.Run("replay request beyond current block is skipped", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 150, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = replayBlock // beyond current block

		result := lp.applyReplayOverride(nil, currentBlock)
		require.Nil(t, result)
		// Status should still be Pending since checkForReplayRequest was called
		require.Equal(t, models.ReplayStatusPending, lp.replay.status)
	})
}

func TestReplay(t *testing.T) {
	t.Run("accepts valid replay request", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo:   currentBlock,
			lookupBlockResult: replayBlock,
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}
		lp.replay.status = models.ReplayStatusNoRequest

		err := lp.Replay(context.Background(), 50)
		require.NoError(t, err)
		require.Equal(t, models.ReplayStatusRequested, lp.replay.status)
		require.Equal(t, uint32(50), lp.replay.requestBlock.SeqNo)
	})

	t.Run("rejects fromBlock at or beyond current block", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo: currentBlock,
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}

		err := lp.Replay(context.Background(), 100)
		require.Error(t, err)
		require.Contains(t, err.Error(), "at or beyond current block")

		err = lp.Replay(context.Background(), 150)
		require.Error(t, err)
		require.Contains(t, err.Error(), "at or beyond current block")
	})

	t.Run("rejects unavailable block in liteserver", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo: currentBlock,
			lookupBlockErr:  ton.ErrBlockNotFound,
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}

		err := lp.Replay(context.Background(), 50)
		require.Error(t, err)
		require.ErrorIs(t, err, ton.ErrBlockNotFound)
	})

	t.Run("uses lookback window when fromSeqNo is 0", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 1000, Shard: 1}
		// lookback = ceil(50s / 2.5s) = 20 blocks, so 1000 - 20 = 980
		lookbackBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 980, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo:   currentBlock,
			lookupBlockResult: lookbackBlock,
		}

		lp := &service{
			lggr:             logger.Sugared(logger.Nop()),
			startingLookback: 50 * time.Second,
			blockTime:        2500 * time.Millisecond,
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}
		lp.replay.status = models.ReplayStatusNoRequest

		err := lp.Replay(context.Background(), 0)
		require.NoError(t, err)
		require.Equal(t, models.ReplayStatusRequested, lp.replay.status)
		require.Equal(t, uint32(980), lp.replay.requestBlock.SeqNo)
	})

	t.Run("ignores redundant request with higher block", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}
		existingReplayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 40, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo:   currentBlock,
			lookupBlockResult: replayBlock,
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}
		// Already have a request for block 40
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = existingReplayBlock

		// Try to request block 50 (higher than 40)
		err := lp.Replay(context.Background(), 50)
		require.NoError(t, err)
		// Should keep the lower block request
		require.Equal(t, uint32(40), lp.replay.requestBlock.SeqNo)
	})

	t.Run("accepts lower block request", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 30, Shard: 1}
		existingReplayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo:   currentBlock,
			lookupBlockResult: replayBlock,
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}
		// Already have a request for block 50
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = existingReplayBlock

		// Request block 30 (lower than 50)
		err := lp.Replay(context.Background(), 30)
		require.NoError(t, err)
		// Should update to the lower block
		require.Equal(t, uint32(30), lp.replay.requestBlock.SeqNo)
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

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

		result := lp.applyReplayOverride(context.Background(), originalRange, currentBlock)
		require.Same(t, originalRange, result)
	})

	t.Run("idle chain with replay constructs new blockRange", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{lookupBlockResult: replayBlock}, nil
			},
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = replayBlock

		// blockRange is nil (chain is idle)
		result := lp.applyReplayOverride(context.Background(), nil, currentBlock)
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
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{lookupBlockResult: replayBlock}, nil
			},
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = replayBlock

		result := lp.applyReplayOverride(context.Background(), originalRange, currentBlock)
		require.Same(t, originalRange, result)
		require.Equal(t, uint32(50), result.FromSeqNo(), "should override starting block")
		require.Equal(t, uint32(100), result.ToSeqNo())
	})

	t.Run("replay rejected and status reset when block beyond current", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 150, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{}, nil
			},
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = replayBlock // beyond current block

		result := lp.applyReplayOverride(context.Background(), nil, currentBlock)
		require.Nil(t, result)
		// Status should be Complete after replayComplete() is called
		require.Equal(t, models.ReplayStatusComplete, lp.replay.status)
		require.Nil(t, lp.replay.requestBlock)
	})

	t.Run("replay rejected and status reset when block pruned", func(t *testing.T) {
		currentBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{lookupBlockErr: ton.ErrBlockNotFound}, nil
			},
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = replayBlock

		result := lp.applyReplayOverride(context.Background(), nil, currentBlock)
		require.Nil(t, result)
		// Status should be Complete after replayComplete() is called
		require.Equal(t, models.ReplayStatusComplete, lp.replay.status)
		require.Nil(t, lp.replay.requestBlock)
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

	t.Run("uses lookback window when fromBlock is 0", func(t *testing.T) {
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


package logpoller

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

func TestApplyReplayOverride(t *testing.T) {
	t.Parallel()

	t.Run("no replay request returns original blockRange", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100}
		originalRange := &models.BlockRange{
			Prev: &ton.BlockIDExt{SeqNo: 90},
			To:   currentMasterchainBlock,
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{}, nil
			},
		}
		lp.replay.status = models.ReplayStatusNoRequest

		result := lp.applyReplayOverride(context.Background(), originalRange, currentMasterchainBlock)
		require.Same(t, originalRange, result)
	})

	t.Run("idle chain with replay constructs new blockRange", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
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
		result := lp.applyReplayOverride(context.Background(), nil, currentMasterchainBlock)
		require.NotNil(t, result, "should construct block range for idle chain replay")
		require.Equal(t, uint32(50), result.FromSeqNo())
		require.Equal(t, uint32(100), result.ToSeqNo())
		require.Equal(t, models.ReplayStatusPending, lp.replay.status)
	})

	t.Run("replay overrides existing blockRange", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		originalRange := &models.BlockRange{
			Prev: &ton.BlockIDExt{SeqNo: 90},
			To:   currentMasterchainBlock,
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

		result := lp.applyReplayOverride(context.Background(), originalRange, currentMasterchainBlock)
		require.Same(t, originalRange, result)
		require.Equal(t, uint32(50), result.FromSeqNo(), "should override starting block")
		require.Equal(t, uint32(100), result.ToSeqNo())
	})

	t.Run("replay rejected and status reset when block beyond current", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 150, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{}, nil
			},
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = replayBlock // beyond current block

		result := lp.applyReplayOverride(context.Background(), nil, currentMasterchainBlock)
		require.Nil(t, result)
		// Status should be NoRequest after clearReplayRequest() is called (rejection resets to initial state)
		require.Equal(t, models.ReplayStatusNoRequest, lp.replay.status)
		require.Nil(t, lp.replay.requestBlock)
	})

	t.Run("replay rejected and status reset when block pruned", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{lookupBlockErr: ton.ErrBlockNotFound}, nil
			},
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = replayBlock

		result := lp.applyReplayOverride(context.Background(), nil, currentMasterchainBlock)
		require.Nil(t, result)
		// Status should be NoRequest after clearReplayRequest() is called (rejection resets to initial state)
		require.Equal(t, models.ReplayStatusNoRequest, lp.replay.status)
		require.Nil(t, lp.replay.requestBlock)
	})
}

func TestReplay(t *testing.T) {
	t.Parallel()

	t.Run("accepts valid replay request", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo:   currentMasterchainBlock,
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
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo: currentMasterchainBlock,
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
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo: currentMasterchainBlock,
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
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 1000, Shard: 1}
		// lookback = ceil(50s / 2.5s) = 20 blocks, so 1000 - 20 = 980
		lookbackBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 980, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo:   currentMasterchainBlock,
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
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}
		existingReplayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 40, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo:   currentMasterchainBlock,
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
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		replayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 30, Shard: 1}
		existingReplayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo:   currentMasterchainBlock,
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

	t.Run("handles concurrent replay requests", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}

		// Mock returns a block matching the requested SeqNo
		mock := &mockAPIClient{
			masterchainInfo: currentMasterchainBlock,
			lookupBlockFunc: func(seqNo uint32) *ton.BlockIDExt {
				return &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: seqNo, Shard: 1}
			},
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}
		lp.replay.status = models.ReplayStatusNoRequest

		var wg sync.WaitGroup
		var err1, err2 error

		// Use a barrier to maximize concurrent execution
		ready := make(chan struct{})

		// Issue two concurrent replay requests
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-ready // wait for signal
			err1 = lp.Replay(context.Background(), 50)
		}()
		go func() {
			defer wg.Done()
			<-ready // wait for signal
			err2 = lp.Replay(context.Background(), 30)
		}()

		// Release both goroutines simultaneously
		close(ready)
		wg.Wait()

		// Both should succeed (no errors)
		require.NoError(t, err1)
		require.NoError(t, err2)

		// The lower block (30) should always win regardless of execution order
		require.Equal(t, models.ReplayStatusRequested, lp.replay.status)
		require.Equal(t, uint32(30), lp.replay.requestBlock.SeqNo)
	})

	t.Run("accepts lower block request during pending replay", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		existingReplayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}
		newReplayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 30, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo:   currentMasterchainBlock,
			lookupBlockResult: newReplayBlock,
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}
		// Simulate a replay that has already started processing
		lp.replay.status = models.ReplayStatusPending
		lp.replay.requestBlock = existingReplayBlock

		// Request a lower block while replay is in progress
		err := lp.Replay(context.Background(), 30)
		require.NoError(t, err)

		// Should update to the lower block but keep Pending status
		require.Equal(t, models.ReplayStatusPending, lp.replay.status, "status should remain Pending")
		require.Equal(t, uint32(30), lp.replay.requestBlock.SeqNo, "should update to lower block")
	})

	t.Run("ignores higher block request during pending replay", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		existingReplayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 30, Shard: 1}
		newReplayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo:   currentMasterchainBlock,
			lookupBlockResult: newReplayBlock,
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}
		// Simulate a replay that has already started processing
		lp.replay.status = models.ReplayStatusPending
		lp.replay.requestBlock = existingReplayBlock

		// Request a higher block while replay is in progress
		err := lp.Replay(context.Background(), 50)
		require.NoError(t, err)

		// Should keep the lower block and Pending status
		require.Equal(t, models.ReplayStatusPending, lp.replay.status)
		require.Equal(t, uint32(30), lp.replay.requestBlock.SeqNo, "should keep existing lower block")
	})

	t.Run("concurrent requests during pending replay", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		existingReplayBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 40, Shard: 1}

		mock := &mockAPIClient{
			masterchainInfo: currentMasterchainBlock,
			lookupBlockFunc: func(seqNo uint32) *ton.BlockIDExt {
				return &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: seqNo, Shard: 1}
			},
		}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return mock, nil
			},
		}
		// Simulate a replay already in progress
		lp.replay.status = models.ReplayStatusPending
		lp.replay.requestBlock = existingReplayBlock

		var wg sync.WaitGroup
		ready := make(chan struct{})

		// Issue concurrent requests: one lower (20), one higher (60) than existing (40)
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-ready
			_ = lp.Replay(context.Background(), 60) // higher than 40, should be ignored
		}()
		go func() {
			defer wg.Done()
			<-ready
			_ = lp.Replay(context.Background(), 20) // lower than 40, should win
		}()

		close(ready)
		wg.Wait()

		// The lowest block (20) should win, status remains Pending
		require.Equal(t, models.ReplayStatusPending, lp.replay.status)
		require.Equal(t, uint32(20), lp.replay.requestBlock.SeqNo)
	})
}

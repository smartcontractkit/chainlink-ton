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
		// Replay from block 51 is stored as prev block 50
		prevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				// Validation looks up replayFromBlock (prevBlock.SeqNo + 1 = 51)
				return &mockAPIClient{lookupBlockResult: &ton.BlockIDExt{SeqNo: 51}}, nil
			},
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = prevBlock

		// blockRange is nil (chain is idle)
		result := lp.applyReplayOverride(context.Background(), nil, currentMasterchainBlock)
		require.NotNil(t, result, "should construct block range for idle chain replay")
		require.Equal(t, uint32(50), result.FromSeqNo()) // prev block
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
		// Replay from block 51 is stored as prev block 50
		prevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				// Validation looks up replayFromBlock (prevBlock.SeqNo + 1 = 51)
				return &mockAPIClient{lookupBlockResult: &ton.BlockIDExt{SeqNo: 51}}, nil
			},
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = prevBlock

		result := lp.applyReplayOverride(context.Background(), originalRange, currentMasterchainBlock)
		require.Same(t, originalRange, result)
		require.Equal(t, uint32(50), result.FromSeqNo(), "should override starting block to prev")
		require.Equal(t, uint32(100), result.ToSeqNo())
	})

	t.Run("replay rejected and status reset when block beyond current", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		// Replay from block 151 is stored as prev block 150, validation checks 151 >= 100
		prevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 150, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{}, nil
			},
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = prevBlock // replayFromBlock (151) is beyond current block

		result := lp.applyReplayOverride(context.Background(), nil, currentMasterchainBlock)
		require.Nil(t, result)
		// Status should be NoRequest after clearReplayRequest() is called (rejection resets to initial state)
		require.Equal(t, models.ReplayStatusNoRequest, lp.replay.status)
		require.Nil(t, lp.replay.requestBlock)
	})

	t.Run("replay rejected and status reset when block pruned", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		// Replay from block 51 is stored as prev block 50, validation looks up block 51
		prevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
			clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
				return &mockAPIClient{lookupBlockErr: ton.ErrBlockNotFound}, nil
			},
		}
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = prevBlock

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

		err := lp.Replay(context.Background(), 50)
		require.NoError(t, err)
		require.Equal(t, models.ReplayStatusRequested, lp.replay.status)
		// Stored block is prev (fromBlock - 1), so replay from 50 stores block 49
		require.Equal(t, uint32(49), lp.replay.requestBlock.SeqNo)
	})

	t.Run("rejects replay from block 1", func(t *testing.T) {
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

		err := lp.Replay(context.Background(), 1)
		require.Error(t, err)
		require.Contains(t, err.Error(), "not supported")
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

		mock := &mockAPIClient{
			masterchainInfo: currentMasterchainBlock,
			lookupBlockFunc: func(seqNo uint32) *ton.BlockIDExt {
				return &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: seqNo, Shard: 1}
			},
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
		// Stored block is prev (fromBlock - 1), so replay from 980 stores block 979
		require.Equal(t, uint32(979), lp.replay.requestBlock.SeqNo)
	})

	t.Run("ignores redundant request with higher block", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		// Existing request for block 40 is stored as prev block 39
		existingPrevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 39, Shard: 1}

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
		// Already have a request for block 40 (stored as prev 39)
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = existingPrevBlock

		// Try to request block 50 (higher than 40)
		err := lp.Replay(context.Background(), 50)
		require.NoError(t, err)
		// Should keep the lower block request (prev 39 = from block 40)
		require.Equal(t, uint32(39), lp.replay.requestBlock.SeqNo)
	})

	t.Run("accepts lower block request", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		// Existing request for block 50 is stored as prev block 49
		existingPrevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 49, Shard: 1}

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
		// Already have a request for block 50 (stored as prev 49)
		lp.replay.status = models.ReplayStatusRequested
		lp.replay.requestBlock = existingPrevBlock

		// Request block 30 (lower than 50)
		err := lp.Replay(context.Background(), 30)
		require.NoError(t, err)
		// Should update to the lower block (stored as prev 29)
		require.Equal(t, uint32(29), lp.replay.requestBlock.SeqNo)
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
		// Stored as prev block 29
		require.Equal(t, models.ReplayStatusRequested, lp.replay.status)
		require.Equal(t, uint32(29), lp.replay.requestBlock.SeqNo)
	})

	t.Run("accepts lower block request during pending replay", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		// Existing request for block 51 is stored as prev block 50
		existingPrevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

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
		// Simulate a replay that has already started processing from block 51 (stored as prev 50)
		lp.replay.status = models.ReplayStatusPending
		lp.replay.requestBlock = existingPrevBlock

		// Request a lower block while replay is in progress
		err := lp.Replay(context.Background(), 30)
		require.NoError(t, err)

		// Should update to the lower block (stored as prev 29) but keep Pending status
		require.Equal(t, models.ReplayStatusPending, lp.replay.status, "status should remain Pending")
		require.Equal(t, uint32(29), lp.replay.requestBlock.SeqNo, "should update to lower block (stored as prev)")
	})

	t.Run("ignores higher block request during pending replay", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		// Existing request for block 31 is stored as prev block 30
		existingPrevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 30, Shard: 1}

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
		// Simulate a replay that has already started processing from block 31 (stored as prev 30)
		lp.replay.status = models.ReplayStatusPending
		lp.replay.requestBlock = existingPrevBlock

		// Request a higher block while replay is in progress
		err := lp.Replay(context.Background(), 50)
		require.NoError(t, err)

		// Should keep the lower block and Pending status
		require.Equal(t, models.ReplayStatusPending, lp.replay.status)
		require.Equal(t, uint32(30), lp.replay.requestBlock.SeqNo, "should keep existing lower block (stored as prev)")
	})

	t.Run("concurrent requests during pending replay", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}
		// Existing request for block 41 is stored as prev block 40
		existingPrevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 40, Shard: 1}

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
		// Simulate a replay already in progress from block 41 (stored as prev 40)
		lp.replay.status = models.ReplayStatusPending
		lp.replay.requestBlock = existingPrevBlock

		var wg sync.WaitGroup
		ready := make(chan struct{})

		// Issue concurrent requests: one lower (20), one higher (60) than existing (41)
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-ready
			_ = lp.Replay(context.Background(), 60) // higher than 41, should be ignored
		}()
		go func() {
			defer wg.Done()
			<-ready
			_ = lp.Replay(context.Background(), 20) // lower than 41, should win
		}()

		close(ready)
		wg.Wait()

		// The lowest block (20) should win, stored as prev 19, status remains Pending
		require.Equal(t, models.ReplayStatusPending, lp.replay.status)
		require.Equal(t, uint32(19), lp.replay.requestBlock.SeqNo)
	})
}

func TestReplayComplete(t *testing.T) {
	t.Parallel()

	t.Run("completes normally when no new request", func(t *testing.T) {
		t.Parallel()
		// Replay from block 51 is stored as prev block 50
		prevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
		}
		lp.replay.status = models.ReplayStatusPending
		lp.replay.requestBlock = prevBlock

		// Parameter is the prev block's SeqNo
		lp.replayComplete(50, 100)
		require.Equal(t, models.ReplayStatusComplete, lp.replay.status)
		require.Nil(t, lp.replay.requestBlock)
	})

	t.Run("completes when new request is for same or higher block", func(t *testing.T) {
		t.Parallel()
		// Replay started from block 51 (prev=50), new request for block 61 (prev=60) came in
		newPrevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 60, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
		}
		lp.replay.status = models.ReplayStatusPending
		lp.replay.requestBlock = newPrevBlock

		// Completed replay from block 51 (prev=50)
		lp.replayComplete(50, 100)
		require.Equal(t, models.ReplayStatusComplete, lp.replay.status, "should complete when new request is for higher block")
		require.Nil(t, lp.replay.requestBlock)
	})

	t.Run("preserves new lower block request during pending replay", func(t *testing.T) {
		t.Parallel()
		// Replay started from block 51 (prev=50), new request for block 31 (prev=30) arrived
		newPrevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 30, Shard: 1}

		lp := &service{
			lggr: logger.Sugared(logger.Nop()),
		}
		lp.replay.status = models.ReplayStatusPending
		lp.replay.requestBlock = newPrevBlock // New request for block 31 stored as prev 30

		// Complete replay that started from block 51 (prev=50)
		lp.replayComplete(50, 100)

		// Should NOT complete - transition to Requested for next tick
		require.Equal(t, models.ReplayStatusRequested, lp.replay.status, "should transition to Requested")
		require.NotNil(t, lp.replay.requestBlock, "should preserve the new request")
		require.Equal(t, uint32(30), lp.replay.requestBlock.SeqNo, "should keep the lower block request (stored as prev)")
	})

	t.Run("request during execution is preserved", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}

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

		// Step 1: Simulate replay already in progress from block 11 (stored as prev 10)
		originalPrevBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 10, Shard: 1}
		lp.replay.status = models.ReplayStatusPending
		lp.replay.requestBlock = originalPrevBlock

		// Step 2: During execution, new request arrives for block 9 (lower than 11)
		err := lp.Replay(context.Background(), 9)
		require.NoError(t, err)

		// Verify the request was accepted (block updated to prev 8, status stays Pending)
		require.Equal(t, models.ReplayStatusPending, lp.replay.status)
		require.Equal(t, uint32(8), lp.replay.requestBlock.SeqNo)

		// Step 3: Original replay completes (from block 11, prev=10)
		lp.replayComplete(10, 100)

		// Step 4: Verify request for block 9 (prev=8) is preserved
		require.Equal(t, models.ReplayStatusRequested, lp.replay.status, "should transition to Requested")
		require.Equal(t, uint32(8), lp.replay.requestBlock.SeqNo, "block 9 request (stored as prev 8) should be preserved")
	})

	t.Run("concurrent replay and completion", func(t *testing.T) {
		t.Parallel()
		currentMasterchainBlock := &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 100, Shard: 1}

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

		// Start with pending replay from block 51 (stored as prev 50)
		lp.replay.status = models.ReplayStatusPending
		lp.replay.requestBlock = &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 50, Shard: 1}

		var wg sync.WaitGroup
		ready := make(chan struct{})

		// Simulate concurrent: replayComplete and new Replay request
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-ready
			lp.replayComplete(50, 100) // Completed from block 51 (prev=50)
		}()
		go func() {
			defer wg.Done()
			<-ready
			_ = lp.Replay(context.Background(), 20) // Request for earlier block
		}()

		close(ready)
		wg.Wait()

		// After concurrent execution, either:
		// 1. Replay(20) happened first -> replayComplete sees lower block -> Requested status
		// 2. replayComplete happened first -> Complete status, then Replay(20) -> Requested status
		// In both cases, the final state should have the request for block 20 preserved
		require.True(t,
			lp.replay.status == models.ReplayStatusRequested ||
				(lp.replay.status == models.ReplayStatusComplete && lp.replay.requestBlock == nil),
			"status should be either Requested (if Replay came first) or Complete (if replayComplete came first then Replay)")

		// If status is Requested, the block 20 request (stored as prev 19) should be preserved
		if lp.replay.status == models.ReplayStatusRequested {
			require.NotNil(t, lp.replay.requestBlock)
			require.Equal(t, uint32(19), lp.replay.requestBlock.SeqNo)
		}
	})
}

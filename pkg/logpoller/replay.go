package logpoller

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// replayInfo tracks the state of a replay operation.
//
// Status flow:
//
//	┌─────────────────────────────────────────┐
//	↓                                         │ (validation fail)
//	NoRequest → Requested → Pending ──────────┘
//	                           │
//	                           ↓ (success)
//	                       Complete
//
// Flow:
//  1. Replay() validates block and stores request → Requested
//  2. checkForReplayRequest() returns (prevBlock, fromBlock) → Pending
//  3. applyReplayOverride() sets blockRange.Prev for (prev, to] processing
//  4. On success: replayComplete() → Complete
//     On failure: clearReplayRequest() → NoRequest
type replayInfo struct {
	mut       sync.RWMutex
	fromBlock uint32          // block to replay from (0 = no request)
	prevBlock *ton.BlockIDExt // block at fromBlock-1 used for block range processing with (prev, to] semantics (nil for block 1, no block 0 on TON)
	status    models.ReplayStatus
}

func (r *replayInfo) hasRequest() bool {
	return r.fromBlock > 0 && (r.status == models.ReplayStatusRequested || r.status == models.ReplayStatusPending)
}

// Replay initiates a new replay request.
// If a replay request has already been made since the previous replay was completed,
// the request will be updated to use the lower of the two fromSeqNo values.
// On the next LogPoller loop tick, all filters will be backfilled starting from fromSeqNo.
// Returns an error immediately if the requested block is invalid or not available in liteserver.
func (lp *service) Replay(ctx context.Context, fromBlock uint32) error {
	currentMasterchainBlock, err := lp.getMasterchainCurrentBlock(ctx)
	if err != nil {
		return fmt.Errorf("failed to get current masterchain block: %w", err)
	}

	// Use safe lookback window if fromBlock is 0 (avoid replaying entire chain)
	if fromBlock == 0 {
		fromBlock = computeLookbackWindow(currentMasterchainBlock.SeqNo, lp.startingLookback, lp.blockTime)
		lp.lggr.Infow("Replay with no starting block specified, using lookback window",
			"lookbackSeqNo", fromBlock, "lookbackDuration", lp.startingLookback)
	}

	// Validate the requested fromBlock exists (old blocks are pruned on mainnet/testnet)
	_, err = lp.lookupRequestedReplayBlock(ctx, fromBlock, currentMasterchainBlock)
	if err != nil {
		return fmt.Errorf("replay rejected: %w", err)
	}

	// Look up the previous block to store. The block range uses (prev, to] semantics.
	// For block 1, prevBlock is nil (no block 0 on TON). Note that block 1 replay is
	// effectively localnet-only since mainnet/testnet prune old blocks (validation above fails).
	var prevBlock *ton.BlockIDExt
	if fromBlock > 1 {
		prevBlock, err = lp.lookupBlock(ctx, fromBlock-1, currentMasterchainBlock)
		if err != nil {
			return fmt.Errorf("replay rejected: failed to lookup previous block %d: %w", fromBlock-1, err)
		}
	}

	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	// compare fromBlock values directly
	if lp.replay.hasRequest() && lp.replay.fromBlock <= fromBlock {
		lp.lggr.Warnf("Ignoring redundant replay request from %d, already requested from block %d",
			fromBlock, lp.replay.fromBlock)
		return nil
	}

	lp.replay.fromBlock = fromBlock
	lp.replay.prevBlock = prevBlock
	if lp.replay.status != models.ReplayStatusPending {
		lp.replay.status = models.ReplayStatusRequested
	}
	return nil
}

// ReplayStatus returns the current replay status of LogPoller:
// - NoRequest: no replay request is pending
// - Requested: a replay has been requested, but has not started yet
// - Pending: a replay is currently in progress
// - Complete: a replay was successfully executed
func (lp *service) ReplayStatus() models.ReplayStatus {
	lp.replay.mut.RLock()
	defer lp.replay.mut.RUnlock()
	return lp.replay.status
}

// lookupRequestedReplayBlock validates and retrieves a replay block.
// Returns error if block is beyond current block or not available in liteserver.
func (lp *service) lookupRequestedReplayBlock(ctx context.Context, requestedReplayBlockSeqNo uint32, currentMasterchainBlock *ton.BlockIDExt) (*ton.BlockIDExt, error) {
	if requestedReplayBlockSeqNo >= currentMasterchainBlock.SeqNo {
		return nil, fmt.Errorf("block %d is at or beyond current block %d", requestedReplayBlockSeqNo, currentMasterchainBlock.SeqNo)
	}

	block, err := lp.lookupBlock(ctx, requestedReplayBlockSeqNo, currentMasterchainBlock)
	if err != nil {
		if errors.Is(err, ton.ErrBlockNotFound) {
			return nil, fmt.Errorf("block %d is not available in liteserver state (likely pruned): %w", requestedReplayBlockSeqNo, err)
		}
		return nil, fmt.Errorf("failed to lookup block %d: %w", requestedReplayBlockSeqNo, err)
	}

	return block, nil
}

// applyReplayOverride checks for replay requests and modifies the block range if needed.
// It handles two cases:
// 1. Normal case: blockRange is not nil, override the starting block
// 2. Idle chain case: blockRange is nil but replay is pending, construct a new range
// Returns the modified blockRange and the fromBlock used for replay (0 if no replay).
// Caller should pass fromBlock to replayComplete() when processing finishes.
func (lp *service) applyReplayOverride(ctx context.Context, blockRange *models.BlockRange, currentMasterchainBlock *ton.BlockIDExt) (*models.BlockRange, uint32) {
	prevBlock, fromBlock := lp.checkForReplayRequest()
	if fromBlock == 0 {
		return blockRange, 0 // No replay request
	}

	// re-validate that the replay target block still exists
	_, err := lp.lookupRequestedReplayBlock(ctx, fromBlock, currentMasterchainBlock)
	if err != nil {
		lp.lggr.Warnw("replay rejected", "error", err, "fromBlock", fromBlock)
		lp.clearReplayRequest()
		return blockRange, 0
	}

	// idle chain case: construct a new block range for replay
	if blockRange == nil {
		blockRange = &models.BlockRange{Prev: prevBlock, To: currentMasterchainBlock}
		lp.lggr.Infow("block range constructed for replay on idle chain",
			"replayFrom", fromBlock,
			"to", currentMasterchainBlock.SeqNo,
		)
		return blockRange, fromBlock
	}

	// override the starting block
	originalPrevSeqNo := blockRange.FromSeqNo()
	blockRange.Prev = prevBlock
	lp.lggr.Infow("block range overridden for replay",
		"originalPrevSeqNo", originalPrevSeqNo,
		"replayFrom", fromBlock,
		"to", blockRange.ToSeqNo(),
	)

	return blockRange, fromBlock
}

// checkForReplayRequest checks for pending replay and returns (prevBlock, fromBlock).
// Returns (nil, 0) if no replay request is pending.
func (lp *service) checkForReplayRequest() (*ton.BlockIDExt, uint32) {
	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	if !lp.replay.hasRequest() {
		return nil, 0
	}

	lp.lggr.Infow("Starting replay", "fromBlock", lp.replay.fromBlock)
	lp.replay.status = models.ReplayStatusPending
	return lp.replay.prevBlock, lp.replay.fromBlock
}

// replayComplete marks a successful replay completion.
// If a new replay request arrived during execution for an earlier block,
// it transitions to Requested status instead of Complete to process on the next tick.
// The completedFromBlock parameter is the fromBlock that was just replayed.
func (lp *service) replayComplete(completedFromBlock, toBlock uint32) {
	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	lp.lggr.Infow("Replay complete", "from", completedFromBlock, "to", toBlock)

	// check if new replay request arrived during execution for an earlier block
	if lp.replay.fromBlock > 0 && lp.replay.fromBlock < completedFromBlock {
		// received a new request for an earlier block while replaying, process next tick
		lp.lggr.Infow("New replay request received during execution, will process next tick",
			"pendingFromBlock", lp.replay.fromBlock, "completedFromBlock", completedFromBlock)
		lp.replay.status = models.ReplayStatusRequested
		return
	}

	lp.replay.status = models.ReplayStatusComplete
	lp.replay.fromBlock = 0
	lp.replay.prevBlock = nil
}

// clearReplayRequest resets the replay state after rejection (e.g., block pruned, validation failed)
func (lp *service) clearReplayRequest() {
	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	lp.replay.status = models.ReplayStatusNoRequest
	lp.replay.fromBlock = 0
	lp.replay.prevBlock = nil
}

package logpoller

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// replayInfo tracks the state of a replay operation
type replayInfo struct {
	mut          sync.RWMutex
	requestBlock *ton.BlockIDExt // validated masterchain block to replay from
	status       models.ReplayStatus
}

func (r *replayInfo) hasRequest() bool {
	return r.status == models.ReplayStatusRequested || r.status == models.ReplayStatusPending
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

	// Reject replay from block 1 (would require nil prev which isn't supported)
	if fromBlock <= 1 {
		return fmt.Errorf("replay from block %d is not supported (minimum is block 2)", fromBlock)
	}

	// Validate the requested fromBlock exists
	_, err = lp.lookupRequestedReplayBlock(ctx, fromBlock, currentMasterchainBlock)
	if err != nil {
		return fmt.Errorf("replay rejected: %w", err)
	}

	// Look up the previous block to store. The block range uses (prev, to] semantics,
	// so storing fromBlock-1 ensures fromBlock is included in replay processing.
	prevBlock, err := lp.lookupBlock(ctx, fromBlock-1, currentMasterchainBlock)
	if err != nil {
		return fmt.Errorf("replay rejected: failed to lookup previous block %d: %w", fromBlock-1, err)
	}

	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	// Compare actual fromBlock values (stored SeqNo + 1)
	if lp.replay.hasRequest() && lp.replay.requestBlock.SeqNo+1 <= fromBlock {
		lp.lggr.Warnf("Ignoring redundant replay request from %d, already requested from block %d",
			fromBlock, lp.replay.requestBlock.SeqNo+1)
		return nil
	}

	lp.replay.requestBlock = prevBlock
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
// Returns the modified blockRange (may be newly constructed for idle chain case).
func (lp *service) applyReplayOverride(ctx context.Context, blockRange *models.BlockRange, currentMasterchainBlock *ton.BlockIDExt) *models.BlockRange {
	prevBlock := lp.checkForReplayRequest()
	if prevBlock == nil {
		return blockRange
	}

	// The stored block is the prev block; actual replay starts at prevBlock.SeqNo + 1
	replayFromBlock := prevBlock.SeqNo + 1

	// re-validate that the replay target block still exists
	_, err := lp.lookupRequestedReplayBlock(ctx, replayFromBlock, currentMasterchainBlock)
	if err != nil {
		lp.lggr.Warnw("replay rejected", "error", err, "fromBlock", replayFromBlock)
		lp.clearReplayRequest()
		return blockRange
	}

	// idle chain case: construct a new block range for replay
	if blockRange == nil {
		blockRange = &models.BlockRange{Prev: prevBlock, To: currentMasterchainBlock}
		lp.lggr.Infow("block range constructed for replay on idle chain",
			"replayFrom", replayFromBlock,
			"to", currentMasterchainBlock.SeqNo,
		)
		return blockRange
	}

	// override the starting block
	originalFrom := blockRange.FromSeqNo()
	blockRange.Prev = prevBlock
	lp.lggr.Infow("block range overridden for replay",
		"originalFrom", originalFrom+1,
		"replayFrom", replayFromBlock,
		"to", blockRange.ToSeqNo(),
	)

	return blockRange
}

// checkForReplayRequest checks whether there have been any new replay requests since it was last called,
// and if so sets the pending flag to true and returns the stored prev block
func (lp *service) checkForReplayRequest() *ton.BlockIDExt {
	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	if !lp.replay.hasRequest() {
		return nil
	}

	prevBlock := lp.replay.requestBlock
	lp.lggr.Infow("Starting replay", "fromBlock", prevBlock.SeqNo+1)
	lp.replay.status = models.ReplayStatusPending
	return prevBlock
}

// replayComplete marks a successful replay completion.
// If a new replay request arrived during execution for an earlier block,
// it transitions to Requested status instead of Complete to process on the next tick.
// The prevBlockSeqNo parameter is the Prev.SeqNo from the block range (actual replay started at prevBlockSeqNo+1).
func (lp *service) replayComplete(prevBlockSeqNo, toBlock uint32) {
	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	lp.lggr.Infow("Replay complete", "from", prevBlockSeqNo+1, "to", toBlock)

	// check if new replay request arrived during execution (comparing prev block SeqNos)
	if lp.replay.requestBlock != nil && lp.replay.requestBlock.SeqNo < prevBlockSeqNo {
		// received a new request for an earlier block while replaying, process next tick
		lp.lggr.Infow("New replay request received during execution, will process next tick",
			"pendingFromBlock", lp.replay.requestBlock.SeqNo+1, "completedFromBlock", prevBlockSeqNo+1)
		lp.replay.status = models.ReplayStatusRequested
		return
	}

	lp.replay.status = models.ReplayStatusComplete
	lp.replay.requestBlock = nil
}

// clearReplayRequest resets the replay state after rejection (e.g., block pruned, validation failed)
func (lp *service) clearReplayRequest() {
	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	lp.replay.status = models.ReplayStatusNoRequest
	lp.replay.requestBlock = nil
}

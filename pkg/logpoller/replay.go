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
	// get current block for validation
	currentBlock, err := lp.getCurrentBlock(ctx)
	if err != nil {
		return fmt.Errorf("failed to get current masterchain block: %w", err)
	}

	// Use safe lookback window if fromSeqNo is 0 (avoid replaying entire chain)
	if fromBlock == 0 {
		fromBlock = computeLookbackWindow(currentBlock.SeqNo, lp.startingLookback, lp.blockTime)
		lp.lggr.Infow("Replay with no starting block specified, using lookback window",
			"lookbackSeqNo", fromBlock, "lookbackDuration", lp.startingLookback)
	}

	// validate fromSeqNo is not beyond current block
	if fromBlock >= currentBlock.SeqNo {
		return fmt.Errorf("replay fromSeqNo %d is at or beyond current block %d", fromBlock, currentBlock.SeqNo)
	}

	// lookup and validate block is available in liteserver
	client, err := lp.clientProvider(ctx)
	if err != nil {
		return fmt.Errorf("failed to get client: %w", err)
	}
	replayBlock, err := client.LookupBlock(ctx, currentBlock.Workchain, currentBlock.Shard, fromBlock)
	if err != nil {
		if errors.Is(err, ton.ErrBlockNotFound) {
			// block not found typically means the block has been pruned from liteserver state
			// (check ARCHIVE_TTL configuration if this is unexpected)
			return fmt.Errorf("replay rejected: block %d is not available in liteserver state (likely pruned): %w", fromBlock, err)
		}
		return fmt.Errorf("failed to lookup replay block %d: %w", fromBlock, err)
	}

	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	if lp.replay.hasRequest() && lp.replay.requestBlock.SeqNo <= fromBlock {
		lp.lggr.Warnf("Ignoring redundant replay request from %d, already requested from block %d",
			fromBlock, lp.replay.requestBlock.SeqNo)
		return nil
	}

	lp.replay.requestBlock = replayBlock
	if lp.replay.status != models.ReplayStatusPending {
		lp.replay.status = models.ReplayStatusRequested
	}
	return nil
}

// ReplayStatus returns the current replay status of LogPoller:
// - NoRequest: there have not been any replay requests yet since service startup
// - Requested: a replay has been requested, but has not started yet
// - Pending: a replay is currently in progress
// - Complete: there was at least one replay executed since startup, but all have since completed
func (lp *service) ReplayStatus() models.ReplayStatus {
	lp.replay.mut.RLock()
	defer lp.replay.mut.RUnlock()
	return lp.replay.status
}

// applyReplayOverride checks for replay requests and modifies the block range if needed.
// It handles two cases:
// 1. Normal case: blockRange is not nil, override the starting block
// 2. Idle chain case: blockRange is nil but replay is pending, construct a new range
// Returns the modified blockRange (may be newly constructed for idle chain case).
func (lp *service) applyReplayOverride(blockRange *models.BlockRange, currentBlock *ton.BlockIDExt) *models.BlockRange {
	replayBlock := lp.checkForReplayRequest()
	if replayBlock == nil {
		return blockRange
	}

	// Validate replay range - requested block must be less than current block
	if replayBlock.SeqNo >= currentBlock.SeqNo {
		lp.lggr.Warnw("replay fromBlock is beyond current block, skipping override",
			"fromBlock", replayBlock.SeqNo, "currentBlock", currentBlock.SeqNo)
		return blockRange
	}

	// idle chain case: construct a new block range for replay
	if blockRange == nil {
		blockRange = &models.BlockRange{Prev: replayBlock, To: currentBlock}
		lp.lggr.Infow("block range constructed for replay on idle chain",
			"replayFrom", replayBlock.SeqNo,
			"to", currentBlock.SeqNo,
		)
		return blockRange
	}

	// override the starting block
	originalFrom := blockRange.FromSeqNo()
	blockRange.Prev = replayBlock
	lp.lggr.Infow("block range overridden for replay",
		"originalFrom", originalFrom,
		"replayFrom", replayBlock.SeqNo,
		"to", blockRange.ToSeqNo(),
	)

	return blockRange
}

// checkForReplayRequest checks whether there have been any new replay requests since it was last called,
// and if so sets the pending flag to true and returns the validated block
func (lp *service) checkForReplayRequest() *ton.BlockIDExt {
	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	if !lp.replay.hasRequest() {
		return nil
	}

	requestBlock := lp.replay.requestBlock
	lp.lggr.Infow("Starting replay", "fromBlock", requestBlock.SeqNo)
	lp.replay.status = models.ReplayStatusPending
	return requestBlock
}

// replayComplete marks the replay as complete
func (lp *service) replayComplete(fromBlock, toBlock uint32) {
	lp.replay.mut.Lock()
	defer lp.replay.mut.Unlock()

	lp.lggr.Infow("Replay complete", "from", fromBlock, "to", toBlock)
	lp.replay.status = models.ReplayStatusComplete
	lp.replay.requestBlock = nil
}

package logpoller

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// getMasterchainBlockRange calculates the range of blocks that need to be processed.
// Returns nil if there are no new blocks to process.
func (lp *service) getMasterchainBlockRange(ctx context.Context) (*models.BlockRange, error) {
	client, err := lp.clientProvider(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get client: %w", err)
	}

	toBlock, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current masterchain info: %w", err)
	}

	// validate that the returned block belongs to the masterchain.
	// a compromised or faulty liteserver could return valid blocks from the wrong workchain,
	// which would cause the logpoller to track incorrect chain data.
	if toBlock.Workchain != address.MasterchainID {
		return nil, fmt.Errorf("expected masterchain block (workchain %d), got workchain %d", address.MasterchainID, toBlock.Workchain)
	}

	lastProcessedBlock, err := lp.getLastProcessedBlock(toBlock)
	if err != nil {
		return nil, fmt.Errorf("failed to get last processed block: %w", err)
	}

	// if we've already processed this block, wait for the next one
	if toBlock.SeqNo <= lastProcessedBlock {
		return nil, nil
	}

	prevBlock, err := lp.resolvePreviousBlock(ctx, lastProcessedBlock, toBlock)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve previous block: %w", err)
	}

	return &models.BlockRange{Prev: prevBlock, To: toBlock}, nil
}

// getLastProcessedBlock retrieves the last processed masterchain sequence number.
// If no previous block has been processed, it uses the lookback window to determine
// an appropriate starting point to avoid missing recent events.
func (lp *service) getLastProcessedBlock(currentBlock *ton.BlockIDExt) (uint32, error) {
	lastProcessed := lp.lastProcessedBlock
	if lastProcessed > 0 {
		return lastProcessed, nil
	}

	// TODO: get the latest processed seqno from log table when persistent storage is implemented
	// TODO: need to implement a separate routine to fetch and cache the masterchain seqno from shard block in each message

	if currentBlock.SeqNo == 0 {
		return 0, errors.New("current masterchain seqno is 0 - waiting for next block to start processing")
	}

	lookbackSeqNo := computeLookbackWindow(currentBlock.SeqNo, lp.startingLookback, lp.blockTime)

	if lookbackSeqNo > lastProcessed {
		blocksToProcess := currentBlock.SeqNo - lookbackSeqNo
		lp.lggr.Debugw("Starting from lookback window",
			"fromSeqNo", lookbackSeqNo,
			"toSeqNo", currentBlock.SeqNo,
			"blocksToProcess", blocksToProcess,
		)
		return lookbackSeqNo, nil
	}

	// Only log when actually resuming from previous work (lastProcessed > 0)
	if lastProcessed > 0 {
		lp.lggr.Debugw("Resuming from last processed", "seqNo", lastProcessed)
	}
	return lastProcessed, nil
}

// resolvePreviousBlock determines the previous block reference based on the last processed sequence number
func (lp *service) resolvePreviousBlock(ctx context.Context, lastProcessedBlockSeqNo uint32, toBlock *ton.BlockIDExt) (*ton.BlockIDExt, error) {
	if lastProcessedBlockSeqNo == 0 {
		// No previous block reference - lookback window returned 0
		// (chain is shorter than configured lookback duration, likely localnet)
		return nil, nil
	}

	client, err := lp.clientProvider(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get client: %w", err)
	}
	// get the prevBlock based on the last processed sequence number
	prevBlock, err := client.LookupBlock(ctx, toBlock.Workchain, toBlock.Shard, lastProcessedBlockSeqNo)
	if err != nil {
		return nil, fmt.Errorf("LookupBlock for previous seqno %d: %w", lastProcessedBlockSeqNo, err)
	}
	return prevBlock, nil
}

// computeLookbackWindow calculates the lookback sequence number
// based on the current sequence number, lookback duration, and block time.
func computeLookbackWindow(currentSeqNo uint32, lookbackDuration time.Duration, blockTime time.Duration) uint32 {
	// Calculate how many blocks to go back based on time duration
	// Use ceiling division like Solana: ceil(lookback/blockTime) = (lookback-1)/blockTime + 1
	//nolint:gosec //G115: integer overflow conversion int64 -> uint32
	lookbackBlocks := uint32(int64((lookbackDuration-1)/blockTime) + 1)

	var lookbackSeqNo uint32
	if currentSeqNo > lookbackBlocks {
		lookbackSeqNo = currentSeqNo - lookbackBlocks
	} else {
		// If lookback went before genesis, start from 0(likely with localnet)
		lookbackSeqNo = 0
	}

	return lookbackSeqNo
}

// applyReplayOverride checks for replay requests and modifies the block range if needed
func (lp *service) applyReplayOverride(ctx context.Context, blockRange *models.BlockRange) error {
	hasReplay, requestedBlock := lp.checkForReplayRequest()
	if !hasReplay {
		return nil
	}

	// Validate replay range
	if requestedBlock >= blockRange.ToSeqNo() {
		lp.lggr.Debugw("replay fromBlock is beyond current range, skipping override",
			"fromBlock", requestedBlock,
			"toBlock", blockRange.ToSeqNo())
		return nil
	}

	// Lookup the block for replay starting point
	prevBlock, err := lp.getBlockForReplay(ctx, requestedBlock)
	if err != nil {
		return fmt.Errorf("failed to get block for replay fromBlock=%d: %w", requestedBlock, err)
	}

	blockRange.Prev = prevBlock
	lp.lggr.Infow("block range overridden for replay",
		"originalFrom", blockRange.FromSeqNo(),
		"replayFrom", requestedBlock,
		"to", blockRange.ToSeqNo(),
	)

	return nil
}

// getBlockForReplay retrieves the block information for the given sequence number
func (lp *service) getBlockForReplay(ctx context.Context, fromBlock uint32) (*ton.BlockIDExt, error) {
	if fromBlock == 0 {
		return nil, nil
	}

	client, err := lp.clientProvider(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get client: %w", err)
	}

	toBlock, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current masterchain info: %w", err)
	}

	prevBlock, err := client.LookupBlock(ctx, toBlock.Workchain, toBlock.Shard, fromBlock)
	if err != nil {
		return nil, fmt.Errorf("LookupBlock for seqno %d: %w", fromBlock, err)
	}

	return prevBlock, nil
}

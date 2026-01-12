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

// getMasterchainCurrentBlock retrieves the current masterchain block information.
// This is separated from getBlockRange to allow replay override to use
// the current masterchain block even when no new blocks need processing.
func (lp *service) getMasterchainCurrentBlock(ctx context.Context) (*ton.BlockIDExt, error) {
	client, err := lp.clientProvider(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get client: %w", err)
	}

	currentBlock, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get current masterchain info: %w", err)
	}

	// validate that the returned block belongs to the masterchain
	if currentBlock.Workchain != address.MasterchainID {
		return nil, fmt.Errorf("expected masterchain block (workchain %d), got workchain %d", address.MasterchainID, currentBlock.Workchain)
	}

	return currentBlock, nil
}

// getBlockRange calculates the range of blocks that need to be processed.
// Returns nil if there are no new blocks to process (chain is idle).
// The currentMasterchainBlock parameter should be obtained from getMasterchainCurrentBlock().
func (lp *service) getBlockRange(ctx context.Context, currentMasterchainBlock *ton.BlockIDExt) (*models.BlockRange, error) {
	lastProcessedBlockSeqNo, err := lp.getLastProcessedBlockSeqNo(currentMasterchainBlock)
	if err != nil {
		return nil, fmt.Errorf("failed to get last processed block: %w", err)
	}

	// if we've already processed this block, wait for the next one (chain is idle)
	if currentMasterchainBlock.SeqNo <= lastProcessedBlockSeqNo {
		return nil, nil
	}

	prevBlock, err := lp.resolvePreviousBlock(ctx, lastProcessedBlockSeqNo, currentMasterchainBlock)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve previous block: %w", err)
	}

	return &models.BlockRange{Prev: prevBlock, To: currentMasterchainBlock}, nil
}

// getLastProcessedBlockSeqNo retrieves the last processed masterchain sequence number.
// If no previous block has been processed, it uses the lookback window to determine
// an appropriate starting point to avoid missing recent events.
func (lp *service) getLastProcessedBlockSeqNo(currentMasterchainBlock *ton.BlockIDExt) (uint32, error) {
	lastProcessed := lp.lastProcessedBlockSeqNo
	if lastProcessed > 0 {
		lp.lggr.Debugw("Resuming from last processed block", "seqNo", lastProcessed)
		return lastProcessed, nil
	}

	// TODO: get the latest processed seqno from log table when persistent storage is implemented
	// TODO: need to implement a separate routine to fetch and cache the masterchain seqno from shard block in each message

	if currentMasterchainBlock.SeqNo == 0 {
		// localnet genesis
		return 0, errors.New("current masterchain seqno is 0 - waiting for next block to start processing")
	}

	lookbackSeqNo := computeLookbackWindow(currentMasterchainBlock.SeqNo, lp.startingLookback, lp.blockTime)

	if lookbackSeqNo > lastProcessed {
		blocksToProcess := currentMasterchainBlock.SeqNo - lookbackSeqNo
		lp.lggr.Debugw("Starting from lookback window",
			"fromSeqNo", lookbackSeqNo,
			"toSeqNo", currentMasterchainBlock.SeqNo,
			"blocksToProcess", blocksToProcess,
		)
		return lookbackSeqNo, nil
	}

	return lastProcessed, nil
}

// lookupBlock retrieves a block by sequence number using the current masterchain block's workchain and shard.
func (lp *service) lookupBlock(ctx context.Context, seqNo uint32, currentMasterchainBlock *ton.BlockIDExt) (*ton.BlockIDExt, error) {
	client, err := lp.clientProvider(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get client: %w", err)
	}
	return client.LookupBlock(ctx, currentMasterchainBlock.Workchain, currentMasterchainBlock.Shard, seqNo)
}

// resolvePreviousBlock determines the previous block reference based on the last processed sequence number
func (lp *service) resolvePreviousBlock(ctx context.Context, lastProcessedBlockSeqNo uint32, toBlock *ton.BlockIDExt) (*ton.BlockIDExt, error) {
	if lastProcessedBlockSeqNo == 0 {
		// No previous block reference - lookback window returned 0
		// (chain is shorter than configured lookback duration, likely localnet)
		return nil, nil
	}

	prevBlock, err := lp.lookupBlock(ctx, lastProcessedBlockSeqNo, toBlock)
	if err != nil {
		return nil, fmt.Errorf("failed to lookup previous block %d: %w", lastProcessedBlockSeqNo, err)
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

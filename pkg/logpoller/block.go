package logpoller

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
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
	checkpointSeqNo, err := lp.getOrComputeCheckpointSeqNo(ctx, currentMasterchainBlock)
	if err != nil {
		return nil, fmt.Errorf("failed to get checkpoint seqno: %w", err)
	}

	// if we've already processed this block, wait for the next one (chain is idle)
	if currentMasterchainBlock.SeqNo <= checkpointSeqNo {
		return nil, nil
	}

	prevBlock, err := lp.resolvePreviousBlock(ctx, checkpointSeqNo, currentMasterchainBlock)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve previous block: %w", err)
	}

	return &models.BlockRange{Prev: prevBlock, To: currentMasterchainBlock}, nil
}

// getOrComputeCheckpointSeqNo returns the masterchain sequence number to resume processing from.
// Priority order:
// 1. In-memory lastProcessedBlockSeqNo (from previous poll iterations)
// 2. Database (highest master_block_seqno from stored logs - for service restart resumption)
// 3. Lookback window calculation (for fresh start)
func (lp *service) getOrComputeCheckpointSeqNo(ctx context.Context, currentMasterchainBlock *ton.BlockIDExt) (uint32, error) {
	// Check in-memory state first (fastest)
	lastProcessed := lp.lastProcessedBlockSeqNo
	if lastProcessed > 0 {
		lp.lggr.Debugw("Resuming from last processed block", "seqNo", lastProcessed)
		return lastProcessed, nil
	}

	// try to resume from database on service restart
	dbSeqno, exists, err := lp.logStore.GetHighestMCBlockSeqno(ctx)
	if err != nil {
		lp.lggr.Warnw("Failed to query latest master block seqno from database, falling back to lookback window",
			"err", err)
	} else if exists {
		if dbSeqno != 0 {
			lp.lggr.Infow("Resuming from database state", "masterBlockSeqno", dbSeqno, "currentSeqNo", currentMasterchainBlock.SeqNo)
			return dbSeqno, nil
		}
		lp.lggr.Warnw("Highest master_block_seqno is 0, falling back to lookback window",
			"currentSeqNo", currentMasterchainBlock.SeqNo)
	}

	// fresh start: use lookback window
	if currentMasterchainBlock.SeqNo == 0 {
		return 0, errors.New("current masterchain seqno is 0 - waiting for next block to start processing")
	}

	lookbackSeqNo := computeLookbackWindow(currentMasterchainBlock.SeqNo, lp.startingLookback, lp.blockTime)

	lp.lggr.Debugw("Starting from lookback window",
		"fromSeqNo", lookbackSeqNo,
		"toSeqNo", currentMasterchainBlock.SeqNo,
		"blocksToProcess", currentMasterchainBlock.SeqNo-lookbackSeqNo,
	)
	return lookbackSeqNo, nil
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

// resolveMCBlockSeqNo returns the masterchain block sequence number that finalized the given shard block.
// Results are cached to optimize batch processing where multiple transactions share the same shard block.
func (lp *service) resolveMCBlockSeqNo(ctx context.Context, shardBlock *ton.BlockIDExt) (uint32, error) {
	if shardBlock == nil {
		return 0, errors.New("shardBlock is nil")
	}

	// transaction blocks should always be shard blocks, not masterchain blocks
	if shardBlock.Workchain == address.MasterchainID {
		return 0, errors.New("unexpected masterchain block: transaction blocks should be shard blocks")
	}

	key := shardBlockKey(shardBlock)

	if seqno, ok := lp.mcBlockCache.Get(key); ok {
		return seqno, nil
	}

	mcSeqNo, err := lp.fetchMCBlockSeqNo(ctx, shardBlock)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch masterchain block seqno for %s: %w", key, err)
	}

	lp.mcBlockCache.Add(key, mcSeqNo)

	return mcSeqNo, nil
}

// fetchMCBlockSeqNo queries liteserver for the masterchain block that finalized the given shard block.
// Uses GetShardBlockProof which directly returns the masterchain block ID.
func (lp *service) fetchMCBlockSeqNo(ctx context.Context, shardBlock *ton.BlockIDExt) (uint32, error) {
	client, err := lp.clientProvider(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to get client: %w", err)
	}

	var resp tl.Serializable
	err = client.Client().QueryLiteserver(ctx, ton.GetShardBlockProof{
		ID: shardBlock,
	}, &resp)
	if err != nil {
		return 0, fmt.Errorf("failed to query shard block proof: %w", err)
	}

	switch t := resp.(type) {
	case ton.ShardBlockProof:
		if t.MasterchainID == nil {
			return 0, errors.New("MasterchainID is nil in shard block proof")
		}
		return t.MasterchainID.SeqNo, nil
	case ton.LSError:
		return 0, fmt.Errorf("liteserver error: code=%d, msg=%s", t.Code, t.Text)
	default:
		return 0, fmt.Errorf("unexpected response type: %T", resp)
	}
}

// shardBlockKey generates a unique cache key for a shard block
func shardBlockKey(block *ton.BlockIDExt) string {
	return fmt.Sprintf("%d:%d:%d", block.Workchain, block.Shard, block.SeqNo)
}

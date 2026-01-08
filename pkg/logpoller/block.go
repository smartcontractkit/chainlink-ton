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

	lastProcessedBlock, err := lp.getLastProcessedBlock(ctx, toBlock)
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
// Priority order:
// 1. In-memory lastProcessedBlock (from previous poll iterations)
// 2. Database (highest master_block_seqno from stored logs - for service restart resumption)
// 3. Lookback window calculation (for fresh start)
func (lp *service) getLastProcessedBlock(ctx context.Context, currentBlock *ton.BlockIDExt) (uint32, error) {
	// Check in-memory state first (fastest)
	lastProcessed := lp.lastProcessedBlock
	if lastProcessed > 0 {
		return lastProcessed, nil
	}

	// try to resume from database on service restart
	dbSeqno, err := lp.logStore.GetLatestMasterBlockSeqno(ctx)
	if err != nil {
		lp.lggr.Warnw("Failed to query latest master block seqno from database, falling back to lookback window",
			"err", err)
	} else if dbSeqno > 0 {
		lp.lggr.Infow("Resuming from database state", "masterBlockSeqno", dbSeqno, "currentSeqNo", currentBlock.SeqNo)
		return dbSeqno, nil
	}

	// fresh start: use lookback window
	if currentBlock.SeqNo == 0 {
		return 0, errors.New("current masterchain seqno is 0 - waiting for next block to start processing")
	}

	lookbackSeqNo := computeLookbackWindow(currentBlock.SeqNo, lp.startingLookback, lp.blockTime)

	lp.lggr.Debugw("Starting from lookback window",
		"fromSeqNo", lookbackSeqNo,
		"toSeqNo", currentBlock.SeqNo,
		"blocksToProcess", currentBlock.SeqNo-lookbackSeqNo,
	)
	return lookbackSeqNo, nil
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

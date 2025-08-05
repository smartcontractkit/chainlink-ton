package logpoller

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

type MessageLoader interface {
	BackfillForAddresses(ctx context.Context, addresses []*address.Address, prevBlock, toBlock *ton.BlockIDExt) ([]types.ExternalMsgWithBlockInfo, error)
}

var _ MessageLoader = (*LogCollector)(nil)

// LogCollector handles scanning TON blockchain for external messages from specific addresses.
// This is a simplified implementation for TON CCIP MVP that will be refactored into
// a proper subengine with background workers for production use.
//
// TODO(NONEVM-2188): refactor as subengine, with background workers for production scalability
type LogCollector struct {
	lggr     logger.SugaredLogger // Logger for debugging and monitoring
	client   ton.APIClientWrapped // TON blockchain client
	pageSize uint32               // Number of transactions to fetch per API call
}

// NewLogCollector creates a new LogCollector instance
func NewLogCollector(
	client ton.APIClientWrapped,
	lggr logger.Logger,
	pageSize uint32,
) *LogCollector {
	// TODO(NONEVM-2188): add background worker pool initializaion here
	return &LogCollector{
		lggr:     logger.Sugared(lggr),
		client:   client,
		pageSize: pageSize,
	}
}

// TODO(NONEVM-2188): refactor to use background workers for scale in production
func (lc *LogCollector) BackfillForAddresses(ctx context.Context, addresses []*address.Address, prevBlock, toBlock *ton.BlockIDExt) ([]types.ExternalMsgWithBlockInfo, error) {
	monitoredAddresses := make(map[string]struct{}, len(addresses))
	for _, addr := range addresses {
		monitoredAddresses[addr.String()] = struct{}{}
	}

	shardLastSeqno := make(map[string]uint32)
	var fromBlock *ton.BlockIDExt

	// determine the starting block for the scan.
	// if no previous block is provided, start from the parent of the target `toBlock`.
	if prevBlock == nil {
		b, err := lc.client.GetBlockData(ctx, toBlock)
		if err != nil {
			return nil, fmt.Errorf("failed to get block data for toBlock to find parent: %w", err)
		}
		parents, err := b.BlockInfo.GetParentBlocks()
		if err != nil || len(parents) == 0 {
			return nil, fmt.Errorf("failed to get parent blocks for toBlock: %w", err)
		}
		fromBlock = parents[0]
	} else {
		fromBlock = prevBlock
	}

	// Note: the scan range is (fromBlock, toBlock]. we fetch shards from `fromBlock` (the exclusive boundary)
	// not to process them, but to establish a baseline. the `shardLastSeqno` map will hold the last known sequence number
	// for every shardchain as of `fromBlock`. this is used by `getNotSeenShards` to prevent re-processing of blocks.
	initialShards, err := lc.client.GetBlockShardsInfo(ctx, fromBlock)
	if err != nil {
		return nil, fmt.Errorf("failed to get initial shards from fromBlock %d: %w", fromBlock.SeqNo, err)
	}
	for _, shard := range initialShards {
		shardLastSeqno[getShardID(shard)] = shard.SeqNo
	}

	// discover all new shard blocks that have appeared since the baseline state.
	shardsToScanByMaster, err := lc.findAllShardsInRange(ctx, fromBlock, toBlock, shardLastSeqno)
	if err != nil {
		return nil, err
	}
	lc.lggr.Tracef("Discovered shards to scan across master blocks", "master_block_count", len(shardsToScanByMaster))

	return lc.scanShardsForMessages(ctx, shardsToScanByMaster, monitoredAddresses)
}

func (lc *LogCollector) findAllShardsInRange(ctx context.Context, fromBlock, toMaster *ton.BlockIDExt, shardLastSeqno map[string]uint32) (map[*ton.BlockIDExt][]*ton.BlockIDExt, error) {
	shardsByMaster := make(map[*ton.BlockIDExt][]*ton.BlockIDExt)

	// iterate through each master block in the desired range, excluding the starting block.
	for seqno := fromBlock.SeqNo + 1; seqno <= toMaster.SeqNo; seqno++ {
		masterBlock, err := lc.client.LookupBlock(ctx, address.MasterchainID, toMaster.Shard, seqno)
		if err != nil {
			lc.lggr.Warnw("Failed to lookup master block, skipping", "seqno", seqno, "err", err)
			continue
		}

		shards, err := lc.client.GetBlockShardsInfo(ctx, masterBlock)
		if err != nil {
			return nil, fmt.Errorf("failed to get shards for master %d: %w", masterBlock.SeqNo, err)
		}

		var discoveredShards []*ton.BlockIDExt
		for _, shard := range shards {
			// for each shard in the current master block, find all its ancestor blocks
			// that we haven't processed yet, based on our baseline.
			notSeen, err := lc.getNotSeenShards(ctx, shard, shardLastSeqno)
			if err != nil {
				return nil, fmt.Errorf("failed to get not seen shards for master %d: %w", masterBlock.SeqNo, err)
			}
			if len(notSeen) > 0 {
				discoveredShards = append(discoveredShards, notSeen...)
			}
			// important: update the last seen sequence number for this shardchain *after* the check.
			// this ensures the next master block's check uses the most up-to-date state.
			shardLastSeqno[getShardID(shard)] = shard.SeqNo
		}
		if len(discoveredShards) > 0 {
			shardsByMaster[masterBlock] = discoveredShards
		}
	}
	return shardsByMaster, nil
}

// TODO: stream messages back to log poller to avoid memory overhead in production
func (lc *LogCollector) scanShardsForMessages(ctx context.Context, shardsByMaster map[*ton.BlockIDExt][]*ton.BlockIDExt, monitoredAddresses map[string]struct{}) ([]types.ExternalMsgWithBlockInfo, error) {
	var allFoundTxs []types.TxWithBlockInfo
	var mu sync.Mutex
	var wg sync.WaitGroup

	// scan all discovered shard blocks concurrently for relevant transactions.
	for master, shards := range shardsByMaster {
		lc.lggr.Tracef("Scanning shards for master block", "master_seqno", master.SeqNo, "shard_count", len(shards))
		for _, shard := range shards {
			lc.lggr.Tracef("Scanning shard", "shard_workchain", shard.Workchain, "shard_id", shard.Shard, "seqno", shard.SeqNo)
			wg.Add(1)
			go func(masterBlock, shardBlock *ton.BlockIDExt) {
				defer wg.Done()
				txs, err := lc.fetchTransactionsInBlock(ctx, masterBlock, shardBlock, monitoredAddresses) // calc: ShardNumPerMaster
				if err != nil {
					lc.lggr.Errorw("Failed to fetch all transactions from shard block", "shard", getShardID(shardBlock), "seqno", shardBlock.SeqNo, "err", err)
					return
				}
				if len(txs) > 0 {
					mu.Lock()
					allFoundTxs = append(allFoundTxs, txs...)
					mu.Unlock()
				}
			}(master, shard)
		}
	}
	wg.Wait()

	lc.lggr.Tracef("Finished scanning all shards.", "total_txs_found", len(allFoundTxs))

	var finalMessages []types.ExternalMsgWithBlockInfo
	// iterate through all found transactions and extract the external outbound messages.
	for _, txWithBlock := range allFoundTxs {
		tx := txWithBlock.Tx

		if tx.IO.Out == nil {
			// skip transactions without output messages
			continue
		}
		msgs, _ := tx.IO.Out.ToSlice()
		for _, msg := range msgs {
			// we are only interested in external outbound messages, which represent events.
			if msg.MsgType == tlb.MsgTypeExternalOut {
				ext := msg.AsExternalOut()
				if ext.Body != nil {
					finalMessages = append(finalMessages, types.ExternalMsgWithBlockInfo{
						TxWithBlockInfo: txWithBlock,
						Msg:             ext,
					})
				}
			}
		}
	}
	return finalMessages, nil
}

func (lc *LogCollector) fetchTransactionsInBlock(ctx context.Context, masterBlock, shardBlock *ton.BlockIDExt, monitoredAddresses map[string]struct{}) ([]types.TxWithBlockInfo, error) {
	var transactions []types.TxWithBlockInfo
	var mu sync.Mutex

	var after *ton.TransactionID3
	var more = true

	fullShardBlockData, err := lc.client.GetBlockData(ctx, shardBlock) // calc: BlockNum
	if err != nil {
		return nil, fmt.Errorf("GetBlockData for shard failed: %w", err)
	}
	blockTimestamp := time.Unix(int64(fullShardBlockData.BlockInfo.GenUtime), 0)

	// paginate through all transactions in a given shard block.
	for more {
		txInfos, moreResult, err := lc.client.GetBlockTransactionsV2(ctx, shardBlock, lc.pageSize, after) // calc: BlockNum * PageNum
		if err != nil {
			return nil, fmt.Errorf("GetBlockTransactionsV2 failed: %w", err)
		}
		if len(txInfos) == 0 {
			break
		}

		var wg sync.WaitGroup
		for _, info := range txInfos {
			wg.Add(1)
			go func(info ton.TransactionShortInfo) {
				defer wg.Done()
				// optimization: filter transactions by address before fetching the full transaction data.
				// ton.TransactionShortInfo only contains the account hash, not the full address.
				// we reconstruct the address assuming standard workchain and flags.
				// TODO: Do we ever have a case that having different account flags? https://docs.ton.org/v3/concepts/dive-into-ton/ton-blockchain/smart-contract-addresses#user-friendly-address-flags
				txAddr := address.NewAddress(0, byte(shardBlock.Workchain), info.Account)
				if _, ok := monitoredAddresses[txAddr.String()]; !ok {
					// skip transactions not related to our monitored addresses.
					return
				}
				// fetch the full transaction data only if the address matches.
				tx, err := lc.client.GetTransaction(ctx, shardBlock, txAddr, info.LT) // calc: BlockNum * PageNum * TransactionNumInBlock
				if err != nil {
					lc.lggr.Errorw("GetTransaction failed", "lt", info.LT, "err", err)
					return
				}
				mu.Lock()
				transactions = append(transactions, types.TxWithBlockInfo{Tx: tx, ShardBlock: shardBlock, MasterBlock: masterBlock, BlockTimestamp: blockTimestamp})
				mu.Unlock()
			}(info)
		}
		wg.Wait()

		more = moreResult
		if more {
			// move cursor to the last txID
			after = txInfos[len(txInfos)-1].ID3()
		}
	}
	return transactions, nil
}

// getNotSeenShards recursively walks back through a shard's parent blocks
// to find all blocks that are newer than the sequence numbers in `shardLastSeqno`.
func (lc *LogCollector) getNotSeenShards(ctx context.Context, shard *ton.BlockIDExt, shardLastSeqno map[string]uint32) ([]*ton.BlockIDExt, error) {
	// this is the recursion's base case: stop if we've reached a shard block we have already processed.
	if no, ok := shardLastSeqno[getShardID(shard)]; ok && no >= shard.SeqNo {
		return nil, nil
	}

	b, err := lc.client.GetBlockData(ctx, shard)
	if err != nil {
		return nil, fmt.Errorf("get block data: %w", err)
	}

	parents, err := b.BlockInfo.GetParentBlocks()
	if err != nil {
		return nil, fmt.Errorf("get parent blocks for shard %s: %w", getShardID(shard), err)
	}

	var ret []*ton.BlockIDExt
	// recursively call for all parents to build the chain of unseen blocks from oldest to newest.
	// this correctly handles shard splits, as a block can have multiple parents.
	for _, parent := range parents {
		ext, err := lc.getNotSeenShards(ctx, parent, shardLastSeqno)
		if err != nil {
			return nil, err
		}
		ret = append(ret, ext...)
	}

	// append the current shard to the list after its parents have been added.
	ret = append(ret, shard)
	return ret, nil
}

func getShardID(shard *ton.BlockIDExt) string {
	return fmt.Sprintf("%d|%d", shard.Workchain, shard.Shard)
}

package logpoller

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
)

// TODO: refactor as subengine, with background workers

type Loader struct {
	lggr               logger.SugaredLogger
	client             ton.APIClientWrapped
	pageSize           uint32
	blockConfirmations uint32
}

func NewLoader(
	client ton.APIClientWrapped,
	lggr logger.Logger,
	pageSize uint32,
	blockConfirmations uint32,
) *Loader {
	return &Loader{
		lggr:               logger.Sugared(lggr),
		client:             client,
		pageSize:           pageSize,
		blockConfirmations: blockConfirmations,
	}
}

// TODO: refactor to use background workers for scale
func (lc *Loader) BackfillForAddresses(ctx context.Context, addresses []*address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) ([]*tlb.ExternalMessageOut, error) {

	// GATEKEEPER LOGIC: Ensure the requested block range is safe to process.
	latestMaster, err := lc.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("could not get current masterchain info: %w", err)
	}
	if toBlock.SeqNo+lc.blockConfirmations > latestMaster.SeqNo {
		lc.lggr.Debugw("Requested block range is too new, skipping poll cycle.",
			"toBlock", toBlock.SeqNo,
			"requiredConfirmations", lc.blockConfirmations,
			"latestMasterBlock", latestMaster.SeqNo)
		// Not an error, just nothing to do yet.
		return nil, nil
	}

	var allMsgs []*tlb.ExternalMessageOut
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, addr := range addresses {
		wg.Add(1)
		go func(addr *address.Address) {
			defer wg.Done()
			msgs, err := lc.fetchMessagesForAddress(ctx, addr, prevBlock, toBlock)
			if err != nil {
				lc.lggr.Errorw("failed to fetch messages", "addr", addr.String(), "err", err)
				return
			}
			mu.Lock()
			allMsgs = append(allMsgs, msgs...)
			mu.Unlock()
		}(addr)
	}
	wg.Wait()
	return allMsgs, nil
}

// Note: (prevBlock, toBlock] is the range of blocks to fetch messages from, see getTransactionBounds for details
// TODO: stream messages back to log poller to avoid memory overhead
func (lc *Loader) fetchMessagesForAddress(ctx context.Context, addr *address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) ([]*tlb.ExternalMessageOut, error) {
	if prevBlock != nil && prevBlock.SeqNo >= toBlock.SeqNo {
		return nil, fmt.Errorf("prevBlock %d is not before toBlock %d", prevBlock.SeqNo, toBlock.SeqNo)
	}
	startLT, endLT, endHash, err := lc.getTransactionBounds(ctx, addr, prevBlock, toBlock)
	if err != nil {
		return nil, err
	}
	lc.lggr.Debugw("Scanning transaction range",
		"Block range", fmt.Sprintf("(%d, %d]", func() uint32 {
			if prevBlock != nil {
				return prevBlock.SeqNo
			}
			return 0
		}(), toBlock.SeqNo),
		"LT range", fmt.Sprintf("(%d, %d]", startLT, endLT),
		"address", addr.String(),
	)

	if startLT >= endLT {
		lc.lggr.Tracef("No transactions to process", "address", addr.String(), "startLT", startLT, "endLT", endLT)
		return nil, nil
	}

	var messages []*tlb.ExternalMessageOut
	curLT, curHash := endLT, endHash

	page := 0
	for {
		batch, err := lc.client.ListTransactions(ctx, addr, lc.pageSize, curLT, curHash)
		if errors.Is(err, ton.ErrNoTransactionsWereFound) || len(batch) == 0 {
			break
		} else if err != nil {
			return nil, fmt.Errorf("ListTransactions: %w", err)
		}

		logBatch(lc.lggr, batch, addr.String(), page)

		// Filter and process messages within the current batch.
		// The batch is sorted from oldest to newest.
		for _, tx := range batch {
			if tx.LT > startLT {
				// This is a valid transaction, process its messages.
				if tx.IO.Out != nil {
					msgs, _ := tx.IO.Out.ToSlice()
					for _, msg := range msgs {
						if msg.MsgType == tlb.MsgTypeExternalOut {
							ext := msg.AsExternalOut()
							if ext.Body != nil {
								// TODO: stream message back to log poller.Process
								messages = append(messages, ext)
							}
						}
					}
				}
			}
		}
		// batch[0] is the oldest transaction in this batch.
		// if it's already older than our start point, we don't need to fetch any more pages.
		if batch[0].LT <= startLT {
			break
		}

		// move the cursor to just before the *oldest* tx in this batch,
		// so next page picks up right where this one left off
		curLT, curHash = batch[0].PrevTxLT, batch[0].PrevTxHash
		page++
	}

	return messages, nil
}

/**
 * getTransactionBounds determines the logical time (LT) range for scanning transactions
 * between two blocks for a specific address on the TON blockchain.
 *
 * ┌prevBlock─┐ ┌fromBlock─┐     ┌─toBlock──┐
 * │ TX│TX│TX │ │ TX│TX│TX │ ... │ TX│TX│TX │
 * └────────│─┘ └─│────────┘     └────────│─┘
 *          │     │ <- txs in interest -> │
 *	  lastSeenLT                        endLT
 *    (startLT)
 * prevBlock: Block where the address was last seen(already processed)
 * toBlock: Block where the scan ends
 */
//  TODO: can we reduce the number of calls to GetAccount?
func (lc *Loader) getTransactionBounds(ctx context.Context, addr *address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) (startLT, endLT uint64, endHash []byte, err error) {

	switch {
	case prevBlock == nil:
		startLT = 0
		lc.lggr.Debugw("fresh start", "address", addr.String(), "toSeq", toBlock.SeqNo)
	case prevBlock.SeqNo > 0:
		accPrev, err := lc.client.GetAccount(ctx, prevBlock, addr)
		if err != nil {
			startLT = 0 // account didn't exist before this range
		} else {
			startLT = accPrev.LastTxLT
		}
	default:
		startLT = 0
	}

	waitBlockNum := toBlock.SeqNo + lc.blockConfirmations
	res, err := lc.client.WaitForBlock(waitBlockNum).GetAccount(ctx, toBlock, addr)
	if err != nil {
		return 0, 0, nil, fmt.Errorf("failed to get account state for %s in block %d: %w", addr.String(), toBlock.SeqNo, err)
	}

	return startLT, res.LastTxLT, res.LastTxHash, nil
}

// BackfillForAddresses is the main entry point. It operates on a masterchain block range.
func (lc *Loader) BackfillForAddressesV2(ctx context.Context, addresses []*address.Address, prevMaster, toMaster *ton.BlockIDExt) ([]*tlb.ExternalMessageOut, error) {
	if prevMaster.Workchain != address.MasterchainID || toMaster.Workchain != address.MasterchainID {
		return nil, fmt.Errorf("BackfillForAddresses now requires masterchain blocks, got workchains %d and %d", prevMaster.Workchain, toMaster.Workchain)
	}

	// GATEKEEPER LOGIC: Ensure the requested block range is safe to process.
	latestMaster, err := lc.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("could not get current masterchain info: %w", err)
	}
	if toMaster.SeqNo+lc.blockConfirmations > latestMaster.SeqNo {
		lc.lggr.Debugw("Requested block range is too new, skipping poll cycle.",
			"toBlock", toMaster.SeqNo,
			"requiredConfirmations", lc.blockConfirmations,
			"latestMasterBlock", latestMaster.SeqNo)
		// Not an error, just nothing to do yet.
		return nil, nil
	}

	monitoredAddresses := make(map[string]struct{}, len(addresses))
	for _, addr := range addresses {
		monitoredAddresses[addr.String()] = struct{}{}
	}

	shardLastSeqno := make(map[string]uint32)
	initialShards, err := lc.client.GetBlockShardsInfo(ctx, prevMaster)
	if err != nil {
		return nil, fmt.Errorf("failed to get initial shards from prevMaster %d: %w", prevMaster.SeqNo, err)
	}
	for _, shard := range initialShards {
		shardLastSeqno[getShardID(shard)] = shard.SeqNo
	}

	allShardsToScan, err := lc.findAllShardsInRange(ctx, prevMaster, toMaster, shardLastSeqno)
	if err != nil {
		return nil, err
	}
	lc.lggr.Infow("Discovered shards to scan", "count", len(allShardsToScan))
	for i, s := range allShardsToScan {
		lc.lggr.Debugw("Shard to scan", "index", i, "workchain", s.Workchain, "shard", s.Shard, "seqno", s.SeqNo)
	}
	return lc.scanShardsForMessages(ctx, allShardsToScan, monitoredAddresses)
}

// findAllShardsInRange iterates through master blocks and uses graph traversal to find all new shard blocks.
func (lc *Loader) findAllShardsInRange(ctx context.Context, prevMaster, toMaster *ton.BlockIDExt, shardLastSeqno map[string]uint32) ([]*ton.BlockIDExt, error) {
	var allDiscoveredShards []*ton.BlockIDExt

	// Use a simple, clear loop over the masterchain sequence numbers.
	for seqno := prevMaster.SeqNo + 1; seqno <= toMaster.SeqNo; seqno++ {
		masterBlock, err := lc.client.LookupBlock(ctx, address.MasterchainID, toMaster.Shard, seqno)
		if err != nil {
			// It's possible for master blocks to be skipped, so we just warn and continue.
			lc.lggr.Warnw("Failed to lookup master block, skipping", "seqno", seqno, "err", err)
			continue
		}

		shards, err := lc.client.GetBlockShardsInfo(ctx, masterBlock)
		if err != nil {
			return nil, fmt.Errorf("failed to get shards for master %d: %w", masterBlock.SeqNo, err)
		}

		for _, shard := range shards {
			// The getNotSeenShards logic remains the same.
			notSeen, err := lc.getNotSeenShards(ctx, shard, shardLastSeqno)
			if err != nil {
				return nil, fmt.Errorf("failed to get not seen shards for master %d: %w", masterBlock.SeqNo, err)
			}
			if len(notSeen) > 0 {
				allDiscoveredShards = append(allDiscoveredShards, notSeen...)
				// Update the state map with the latest shard block we are aware of from this master block.
				shardLastSeqno[getShardID(shard)] = shard.SeqNo
			}
		}
	}
	return allDiscoveredShards, nil
}

// getNotSeenShards recursively traverses parent links to find all blocks since the last seen sequence number.
func (lc *Loader) getNotSeenShards(ctx context.Context, shard *ton.BlockIDExt, shardLastSeqno map[string]uint32) ([]*ton.BlockIDExt, error) {
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
	for _, parent := range parents {
		ext, err := lc.getNotSeenShards(ctx, parent, shardLastSeqno)
		if err != nil {
			return nil, err
		}
		ret = append(ret, ext...)
	}

	ret = append(ret, shard)
	return ret, nil
}

// scanShardsForMessages scans a list of shard blocks and returns messages matching the monitored addresses.
func (lc *Loader) scanShardsForMessages(ctx context.Context, shards []*ton.BlockIDExt, monitoredAddresses map[string]struct{}) ([]*tlb.ExternalMessageOut, error) {
	var allMsgs []*tlb.ExternalMessageOut
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, shard := range shards {
		wg.Add(1)
		go func(blockToScan *ton.BlockIDExt) {
			defer wg.Done()
			msgs, err := lc.scanBlock(ctx, blockToScan, monitoredAddresses)
			if err != nil {
				lc.lggr.Errorw("Failed to scan shard block", "shard", getShardID(blockToScan), "seqno", blockToScan.SeqNo, "err", err)
				return
			}
			if len(msgs) > 0 {
				mu.Lock()
				allMsgs = append(allMsgs, msgs...)
				mu.Unlock()
			}
		}(shard)
	}
	wg.Wait()

	return allMsgs, nil
}

// scanBlock is the worker function that scans a single block's transactions.
func (lc *Loader) scanBlock(ctx context.Context, blockToScan *ton.BlockIDExt, monitoredAddresses map[string]struct{}) ([]*tlb.ExternalMessageOut, error) {
	var messages []*tlb.ExternalMessageOut
	var mu sync.Mutex

	var after *ton.TransactionID3
	var more = true

	page := 0
	// Pin the API client to the block for consistent pagination
	pinnedAPI := lc.client.WaitForBlock(blockToScan.SeqNo)

	for more {
		txInfos, moreResult, err := pinnedAPI.GetBlockTransactionsV2(ctx, blockToScan, lc.pageSize, after)
		if err != nil {
			return nil, fmt.Errorf("GetBlockTransactionsV2 failed: %w", err)
		}

		logTxInfos(lc.lggr, txInfos, blockToScan.SeqNo, page)
		var wg sync.WaitGroup
		for _, info := range txInfos {
			txAddr := address.NewAddress(0, byte(blockToScan.Workchain), info.Account)
			if _, ok := monitoredAddresses[txAddr.String()]; ok {
				wg.Add(1)
				go func(info ton.TransactionShortInfo) {
					defer wg.Done()
					tx, err := pinnedAPI.GetTransaction(ctx, blockToScan, txAddr, info.LT)
					if err != nil {
						lc.lggr.Errorw("GetTransaction failed", "lt", info.LT, "err", err)
						return
					}

					if tx.IO.Out != nil {
						msgs, _ := tx.IO.Out.ToSlice()
						var extractedMsgs []*tlb.ExternalMessageOut
						for _, msg := range msgs {
							if msg.MsgType == tlb.MsgTypeExternalOut {
								ext := msg.AsExternalOut()
								if ext.Body != nil {
									extractedMsgs = append(extractedMsgs, ext)
								}
							}
						}
						if len(extractedMsgs) > 0 {
							mu.Lock()
							messages = append(messages, extractedMsgs...)
							mu.Unlock()
						}
					}
				}(info)
			}
		}
		wg.Wait()

		more = moreResult
		if more && len(txInfos) > 0 {
			after = txInfos[len(txInfos)-1].ID3()
		}
		page++
	}

	return messages, nil
}

func getShardID(shard *ton.BlockIDExt) string {
	return fmt.Sprintf("%d|%d", shard.Workchain, shard.Shard)
}

// HELPER LOGGING FUNCTIONS
// ==========================

// logBatch logs details of transactions returned by ListTransactions
func logBatch(l logger.SugaredLogger, batch []*tlb.Transaction, addr string, page int) {
	if len(batch) == 0 {
		l.Debugw("ListTransactions batch is empty", "address", addr, "page", page)
		return
	}

	var txDetails []string
	for _, tx := range batch {
		txDetails = append(txDetails, fmt.Sprintf("{LT: %d, Hash: %x}", tx.LT, tx.Hash))
	}
	l.Debugw("ListTransactions batch content", "address", addr, "page", page, "transactions", txDetails)
}

// logTxInfos logs details of transactions returned by GetBlockTransactionsV2
func logTxInfos(l logger.SugaredLogger, infos []ton.TransactionShortInfo, blockSeqno uint32, page int) {
	if len(infos) == 0 {
		l.Debugw("GetBlockTransactionsV2 batch is empty", "block_seqno", blockSeqno, "page", page)
		return
	}

	var txDetails []string
	for _, info := range infos {
		txDetails = append(txDetails, fmt.Sprintf("{LT: %d, Hash: %x, Account: %s}", info.LT, info.Hash,
			address.NewAddress(0, 0, info.Account).String())) // Assuming workchain 0 for logging
	}
	l.Debugw("GetBlockTransactionsV2 batch content", "block_seqno", blockSeqno, "page", page, "transactions", txDetails)
}

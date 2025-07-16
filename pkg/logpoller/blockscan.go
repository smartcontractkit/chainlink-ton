package logpoller

import (
	"context"
	"fmt"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
)

// Note: V1 -> block-based backfill with ListTransactions - Lower Liteclient calls
// Note: V2 -> block-based backfill with GetTransactionsV2
// Note: V3 -> block-based backfill with GetBlock(low-level) - higher memory pressure
// TODO: clean up after liteclient call benchmark
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
	return lc.scanShardsForMessagesV2(ctx, allShardsToScan, monitoredAddresses)
}

func (lc *Loader) findAllShardsInRange(ctx context.Context, prevMaster, toMaster *ton.BlockIDExt, shardLastSeqno map[string]uint32) ([]*ton.BlockIDExt, error) {
	var allDiscoveredShards []*ton.BlockIDExt

	for seqno := prevMaster.SeqNo + 1; seqno <= toMaster.SeqNo; seqno++ {
		masterBlock, err := lc.client.LookupBlock(ctx, address.MasterchainID, toMaster.Shard, seqno)
		if err != nil {
			lc.lggr.Warnw("Failed to lookup master block, skipping", "seqno", seqno, "err", err)
			continue
		}

		shards, err := lc.client.GetBlockShardsInfo(ctx, masterBlock)
		if err != nil {
			return nil, fmt.Errorf("failed to get shards for master %d: %w", masterBlock.SeqNo, err)
		}

		for _, shard := range shards {
			notSeen, err := lc.getNotSeenShards(ctx, shard, shardLastSeqno)
			if err != nil {
				return nil, fmt.Errorf("failed to get not seen shards for master %d: %w", masterBlock.SeqNo, err)
			}
			if len(notSeen) > 0 {
				allDiscoveredShards = append(allDiscoveredShards, notSeen...)
			}
			shardLastSeqno[getShardID(shard)] = shard.SeqNo
		}
	}
	return allDiscoveredShards, nil
}

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

func (lc *Loader) BackfillForAddressesV3(ctx context.Context, addresses []*address.Address, prevMaster, toMaster *ton.BlockIDExt) ([]*tlb.ExternalMessageOut, error) {
	if prevMaster.Workchain != address.MasterchainID || toMaster.Workchain != address.MasterchainID {
		return nil, fmt.Errorf("BackfillForAddresses now requires masterchain blocks, got workchains %d and %d", prevMaster.Workchain, toMaster.Workchain)
	}

	// ensure the requested block range is safe to process.
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
		return nil, err
	}
	for _, shard := range initialShards {
		shardLastSeqno[getShardID(shard)] = shard.SeqNo
	}

	allShardsToScan, err := lc.findAllShardsInRange(ctx, prevMaster, toMaster, shardLastSeqno)
	if err != nil {
		return nil, err
	}
	lc.lggr.Infow("Discovered shards to scan", "count", len(allShardsToScan))

	return lc.scanShardsForMessages(ctx, allShardsToScan, monitoredAddresses)
}

func (lc *Loader) scanShardsForMessages(ctx context.Context, shards []*ton.BlockIDExt, monitoredAddresses map[string]struct{}) ([]*tlb.ExternalMessageOut, error) {
	var allMsgs []*tlb.ExternalMessageOut
	var mu sync.Mutex
	var wg sync.WaitGroup

	errCh := make(chan error, len(shards))
	for _, shard := range shards {
		wg.Add(1)
		go func(blockToScan *ton.BlockIDExt) {
			defer wg.Done()
			msgs, err := lc.scanBlock(ctx, blockToScan, monitoredAddresses)
			if err != nil {
				errCh <- fmt.Errorf("scan block %s:%d: %w", getShardID(blockToScan), blockToScan.SeqNo, err)
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

	select {
	case e := <-errCh:
		return nil, e // fail fast on the first error
	default:
		return allMsgs, nil
	}
}

func (lc *Loader) scanBlock(ctx context.Context, blockToScan *ton.BlockIDExt, monitoredAddresses map[string]struct{}) ([]*tlb.ExternalMessageOut, error) {
	pinnedAPI := lc.client.WaitForBlock(blockToScan.SeqNo)

	block, err := pinnedAPI.GetBlockData(ctx, blockToScan)
	if err != nil {
		return nil, fmt.Errorf("failed to get block data for shard %s: %w", getShardID(blockToScan), err)
	}

	shardAccounts := block.Extra.ShardAccountBlocks.BeginParse()
	shardAccBlocks, err := shardAccounts.LoadDict(256)
	if err != nil {
		return nil, fmt.Errorf("failed to load account blocks dictionary for shard %s: %w", getShardID(blockToScan), err)
	}

	var messages []*tlb.ExternalMessageOut

	// Iterate over every account that had transactions in this block
	sab := shardAccBlocks.All()
	for _, accKV := range sab {
		slc := accKV.Value.BeginParse()
		if err = tlb.LoadFromCell(&tlb.CurrencyCollection{}, slc); err != nil {
			return nil, fmt.Errorf("failed to load currency collection of account block dict: %w", err)
		}

		var ab tlb.AccountBlock
		if err = tlb.LoadFromCell(&ab, slc); err != nil {
			return nil, fmt.Errorf("faled to parse account block: %w", err)
		}

		addr := address.NewAddress(0, byte(blockToScan.Workchain), ab.Addr)

		lc.lggr.Debugf("block seqno, transaction counts: %d, %d", blockToScan.SeqNo, len(ab.Transactions.All()))

		if _, ok := monitoredAddresses[addr.String()]; ok {
			// Iterate over the dictionary of transactions for this specific account
			for _, txKV := range ab.Transactions.All() {
				slcTx := txKV.Value.BeginParse()
				if err = tlb.LoadFromCell(&tlb.CurrencyCollection{}, slcTx); err != nil {
					return nil, fmt.Errorf("failed to load currency collection of transactions dict: %w", err)
				}

				var tx tlb.Transaction
				if err = tlb.LoadFromCell(&tx, slcTx.MustLoadRef()); err != nil {
					return nil, fmt.Errorf("failed to parse transaction for address %s: %w", addr.String(), err)
				}

				// We found a transaction for a monitored address, now extract its messages.
				if tx.IO.Out != nil {
					msgs, _ := tx.IO.Out.ToSlice()
					for _, msg := range msgs {
						if msg.MsgType == tlb.MsgTypeExternalOut {
							ext := msg.AsExternalOut()
							if ext.Body != nil {
								messages = append(messages, ext)
							}
						}
					}
				}
			}
		}
	}

	return messages, nil
}

func getShardID(shard *ton.BlockIDExt) string {
	return fmt.Sprintf("%d|%d", shard.Workchain, shard.Shard)
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

func (lc *Loader) scanShardsForMessagesV2(ctx context.Context, shards []*ton.BlockIDExt, monitoredAddresses map[string]struct{}) ([]*tlb.ExternalMessageOut, error) {
	var allFoundTxs []*tlb.Transaction
	var mu sync.Mutex
	var wg sync.WaitGroup

	lc.lggr.Debugw("Scanning discovered shards for all transactions", "shard_count", len(shards))

	for _, shard := range shards {
		wg.Add(1)
		go func(blockToScan *ton.BlockIDExt) {
			defer wg.Done()
			// This worker now simply returns ALL transactions from its assigned block.
			txs, err := lc.fetchAllTransactionsInBlock(ctx, blockToScan)
			if err != nil {
				lc.lggr.Errorw("Failed to fetch all transactions from shard block", "shard", getShardID(blockToScan), "seqno", blockToScan.SeqNo, "err", err)
				return
			}
			if len(txs) > 0 {
				mu.Lock()
				allFoundTxs = append(allFoundTxs, txs...)
				mu.Unlock()
			}
		}(shard)
	}
	wg.Wait()

	lc.lggr.Debugw("Finished scanning all shards.", "total_txs_found", len(allFoundTxs))

	// Now, filter the aggregated list of transactions sequentially. This is safe and simple.
	var finalMessages []*tlb.ExternalMessageOut
	for _, tx := range allFoundTxs {
		lc.lggr.Debugf("found tx: %s", tx.IO.In.Msg.DestAddr().StringRaw())
		// Construct address from the transaction data itself.
		txAddr := address.NewAddress(0, byte(0), tx.AccountAddr)
		if _, ok := monitoredAddresses[txAddr.String()]; ok {
			// This is a transaction for an address we care about. Extract its messages.
			if tx.IO.Out != nil {
				msgs, _ := tx.IO.Out.ToSlice()
				for _, msg := range msgs {
					if msg.MsgType == tlb.MsgTypeExternalOut {
						ext := msg.AsExternalOut()
						if ext.Body != nil {
							finalMessages = append(finalMessages, ext)
						}
					}
				}
			}
		}
	}

	return finalMessages, nil
}
func (lc *Loader) fetchAllTransactionsInBlock(ctx context.Context, blockToScan *ton.BlockIDExt) ([]*tlb.Transaction, error) {
	var transactions []*tlb.Transaction
	var mu sync.Mutex

	var after *ton.TransactionID3
	var more = true

	pinnedAPI := lc.client.WaitForBlock(blockToScan.SeqNo)

	for more {
		txInfos, moreResult, err := pinnedAPI.GetBlockTransactionsV2(ctx, blockToScan, 100, after)
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
				txAddr := address.NewAddress(0, byte(blockToScan.Workchain), info.Account)
				tx, err := pinnedAPI.GetTransaction(ctx, blockToScan, txAddr, info.LT)
				if err != nil {
					lc.lggr.Errorw("GetTransaction failed", "lt", info.LT, "err", err)
					return
				}
				mu.Lock()
				transactions = append(transactions, tx)
				mu.Unlock()
			}(info)
		}
		wg.Wait()

		more = moreResult
		if more {
			after = txInfos[len(txInfos)-1].ID3()
		}
	}
	return transactions, nil
}

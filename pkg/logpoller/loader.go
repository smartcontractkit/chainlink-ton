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

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

// TON LogCollector - CCIP MVP Implementation
//
// This LogCollector implements transaction scanning and external message extraction
// for the TON CCIP MVP. It uses account-based transaction scanning with the
// ListTransactions API to fetch transaction history for monitored addresses.
//
// Current MVP approach:
// - Account-based scanning using ListTransactions (reduces liteclient calls)
// - Concurrent processing per address for better performance
// - In-memory message aggregation (will be optimized for production)
//
// The collector handles TON's unique transaction model where each account maintains
// its own transaction chain with logical time (LT) ordering, allowing efficient
// range-based scanning between blocks.

// TODO: might not be the best name..
type EventLoader interface {
	BackfillForAddresses(ctx context.Context, addresses []*address.Address, prevBlock, toBlock *ton.BlockIDExt) ([]types.MsgWithCtx, error)
}

var _ EventLoader = (*LogCollector)(nil)

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

// NewLogCollector creates a new LogCollector instance for TON CCIP MVP
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

// BackfillForAddresses scans TON blockchain for external messages from specified addresses
// between prevBlock and toBlock. This MVP implementation uses concurrent goroutines
// per address for improved performance.
//
// For TON CCIP MVP, this provides sufficient throughput while keeping implementation simple.
// Production version will use background worker pools for better resource management.
//
// TODO(NONEVM-2188): refactor to use background workers for scale in production
func (lc *LogCollector) BackfillForAddresses(ctx context.Context, addresses []*address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) ([]types.MsgWithCtx, error) {
	var allMsgs []types.MsgWithCtx
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

// fetchMessagesForAddress retrieves external messages for a specific address within a block range.
// Uses TON's account-based transaction model with logical time (LT) bounds for efficient scanning.
//
// The method:
// 1. Determines LT bounds using account states at prevBlock and toBlock
// 2. Uses ListTransactions to paginate through the account's transaction history
// 3. Filters for ExternalMessageOut entries within the specified range
//
// Note: Block range (prevBlock, toBlock] is exclusive of prevBlock, inclusive of toBlock
// TODO: stream messages back to log poller to avoid memory overhead in production
func (lc *LogCollector) fetchMessagesForAddress(ctx context.Context, addr *address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) ([]types.MsgWithCtx, error) {
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
		lc.lggr.Trace("No transactions to process", "address", addr.String(), "startLT", startLT, "endLT", endLT)
		return nil, nil
	}

	var msgsWithCtx []types.MsgWithCtx
	curLT, curHash := endLT, endHash

	for {
		batch, err := lc.client.ListTransactions(ctx, addr, lc.pageSize, curLT, curHash)
		if errors.Is(err, ton.ErrNoTransactionsWereFound) || len(batch) == 0 {
			// no more transactions to process
			break
		} else if err != nil {
			return nil, fmt.Errorf("ListTransactions: %w", err)
		}

		// filter and process messages within the current batch.
		// The batch is sorted from oldest to newest.
		for _, tx := range batch {
			if tx.LT <= startLT || tx.IO.Out == nil {
				// no need to process older transactions, they are already handled.
				continue
			}

			msgs, _ := tx.IO.Out.ToSlice()

			for _, msg := range msgs {
				// only interested in ExternalMessageOut
				if msg.MsgType != tlb.MsgTypeExternalOut {
					continue
				}
				ext := msg.AsExternalOut()
				if ext.Body != nil {
					// TODO: stream back to log poller.Process
					event := types.MsgWithCtx{
						TxHash: tx.Hash,
						LT:     tx.LT,
						Msg:    ext,
					}
					msgsWithCtx = append(msgsWithCtx, event)
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
	}

	return msgsWithCtx, nil
}

/**
// getTransactionBounds determines the logical time (LT) range for scanning transactions
// between two blocks for a specific address on the TON blockchain.
//
// TON's account-based transaction model uses logical time (LT) to order transactions
// within each account's transaction chain. This allows efficient range-based scanning.
//
 * ┌prevBlock─┐ ┌fromBlock─┐     ┌─toBlock──┐
 * │ TX│TX│TX │ │ TX│TX│TX │ ... │ TX│TX│TX │
 * └────────│─┘ └─│────────┘     └────────│─┘
 *          │     │ <- txs of interest -> │
 *	  lastSeenLT                        endLT
 *    (startLT)
 * prevBlock: Block where the address was last seen(already processed)
 * toBlock: Block where the scan ends
*/
//  TODO: can we reduce the number of calls to GetAccount?
func (lc *LogCollector) getTransactionBounds(ctx context.Context, addr *address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) (startLT, endLT uint64, endHash []byte, err error) {
	switch {
	case prevBlock == nil:
		startLT = 0
		lc.lggr.Debugw("fresh start", "address", addr.String(), "toSeq", toBlock.SeqNo)
	case prevBlock.SeqNo > 0:
		accPrev, accErr := lc.client.GetAccount(ctx, prevBlock, addr)
		if accErr != nil {
			startLT = 0 // account didn't exist before this range
		} else {
			startLT = accPrev.LastTxLT
		}
	default:
		startLT = 0
	}
	// Get the account state at toBlock to find the end boundary
	res, err := lc.client.WaitForBlock(toBlock.SeqNo).GetAccount(ctx, toBlock, addr)
	if err != nil {
		return 0, 0, nil, fmt.Errorf("failed to get account state for %s in block %d: %w", addr.String(), toBlock.SeqNo, err)
	}

	return startLT, res.LastTxLT, res.LastTxHash, nil
}

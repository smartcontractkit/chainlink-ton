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

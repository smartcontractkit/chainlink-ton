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
	lggr     logger.SugaredLogger
	client   ton.APIClientWrapped
	pageSize uint32
}

func NewLoader(
	client ton.APIClientWrapped,
	lggr logger.Logger,
	pageSize uint32,
) *Loader {
	return &Loader{
		lggr:     logger.Sugared(lggr),
		client:   client,
		pageSize: pageSize,
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

// Note: (prevBlock, toBlock] is the range of blocks to fetch messages from
func (lc *Loader) fetchMessagesForAddress(ctx context.Context, addr *address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) ([]*tlb.ExternalMessageOut, error) {
	// wait for the latest block to be available in the node we're querying, and get account state
	res, err := lc.client.WaitForBlock(toBlock.SeqNo).GetAccount(ctx, toBlock, addr)
	if err != nil {
		return nil, fmt.Errorf("failed to get account state for %s in block %d: %w", addr.String(), toBlock.SeqNo, err)
	}
	// starting cursor for the transaction list
	endLT, endHash := res.LastTxLT, res.LastTxHash

	var lastSeenLT uint64
	// Handle the case where prevBlock is nil (first run)
	if prevBlock == nil {
		lastSeenLT = 0
		lc.lggr.Debugw("fresh start", "address", addr.String(), "toSeq", toBlock.SeqNo)
	} else if prevBlock.SeqNo > 0 {
		// Get the previous block to establish the boundary
		accPrev, err := lc.client.GetAccount(ctx, prevBlock, addr)
		if err != nil {
			lastSeenLT = 0 // Account didn't exist before this range
		} else {
			lastSeenLT = accPrev.LastTxLT // This is the boundary BEFORE fromBlock
		}
	} else {
		lastSeenLT = 0
	}

	if lastSeenLT >= endLT {
		// (startLT, endLT] no transactions to process
		lc.lggr.Debugw("No transactions to process", "address", addr.String(), "startLT", lastSeenLT, "endLT", endLT)
		return nil, nil
	}

	// TODO: stream messages back to log poller to avoid memory overhead
	var messages []*tlb.ExternalMessageOut

	curLT, curHash := endLT, endHash
	done := false

	for !done {
		// ListTransactions - returns list of transactions before (including) passed lt and hash, the oldest one is first in result slice
		// Transactions will be verified to match final tx hash, which should be taken from proved account state, then it is safe.
		batch, err := lc.client.ListTransactions(ctx, addr, lc.pageSize, curLT, curHash)
		if errors.Is(err, ton.ErrNoTransactionsWereFound) {
			break
		} else if err != nil {
			return nil, fmt.Errorf("ListTransactions: %w", err)
		}

		lc.lggr.Debugw("Scanning transaction range",
			"address", addr.String(),
			"fromSeqNo", func() uint32 {
				if prevBlock != nil {
					return prevBlock.SeqNo
				}
				return 0
			}(),
			"toSeqNo", toBlock.SeqNo,
			"startLT", lastSeenLT,
			"endLT", endLT,
			"range", fmt.Sprintf("(%d, %d]", lastSeenLT, endLT))

		// no more txs
		if len(batch) == 0 {
			break
		}

		// txs in batch is old to new order
		for _, tx := range batch {
			if tx.LT <= lastSeenLT {
				// found transaction that is already processed, break the loop
				done = true
				continue
			}

			lc.lggr.Tracef("Processing transaction", "txLT", tx.LT, "txHash", tx.Hash, "contract", addr.String(), "hasOut", tx.IO.Out != nil)

			if tx.IO.Out == nil {
				continue
			}

			msgs, _ := tx.IO.Out.ToSlice()
			for _, msg := range msgs {
				// only log messages
				if msg.MsgType == tlb.MsgTypeExternalOut {
					ext := msg.AsExternalOut()
					if ext.Body != nil {
						lc.lggr.Tracef("Found a log message:", "dst", ext.DstAddr, "src", ext.SrcAddr)
						messages = append(messages, ext)
					}
				}
			}
		}

		if done {
			break
		}
		// move the cursor to just before the *oldest* tx in this batch,
		// so next page picks up right where this one left off
		curLT, curHash = batch[0].PrevTxLT, batch[0].PrevTxHash
	}

	return messages, nil
}

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
// TODO: stream messages back to log poller to avoid memory overhead

func (lc *Loader) fetchMessagesForAddress(ctx context.Context, addr *address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) ([]*tlb.ExternalMessageOut, error) {
	startLT, endLT, endHash, err := lc.getTransactionBounds(ctx, addr, prevBlock, toBlock)
	if err != nil {
		return nil, err
	}

	if startLT >= endLT {
		lc.lggr.Debugw("No transactions to process", "address", addr.String(), "startLT", startLT, "endLT", endLT)
		return nil, nil
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
		"startLT", startLT,
		"endLT", endLT,
		"range", fmt.Sprintf("(%d, %d]", startLT, endLT))

	var messages []*tlb.ExternalMessageOut
	curLT, curHash := endLT, endHash
	done := false

	for !done {
		batch, err := lc.client.ListTransactions(ctx, addr, lc.pageSize, curLT, curHash)
		if errors.Is(err, ton.ErrNoTransactionsWereFound) {
			break
		} else if err != nil {
			return nil, fmt.Errorf("ListTransactions: %w", err)
		}

		if len(batch) == 0 {
			break
		}

		// txs in batch is old to new order
		for _, tx := range batch {
			if tx.LT <= startLT {
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

func (lc *Loader) getTransactionBounds(ctx context.Context, addr *address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) (startLT, endLT uint64, endHash []byte, err error) {
	res, err := lc.client.WaitForBlock(toBlock.SeqNo).GetAccount(ctx, toBlock, addr)
	if err != nil {
		return 0, 0, nil, fmt.Errorf("failed to get account state for %s in block %d: %w", addr.String(), toBlock.SeqNo, err)
	}
	endLT, endHash = res.LastTxLT, res.LastTxHash

	if prevBlock == nil {
		startLT = 0
		lc.lggr.Debugw("fresh start", "address", addr.String(), "toSeq", toBlock.SeqNo)
	} else if prevBlock.SeqNo > 0 {
		accPrev, err := lc.client.GetAccount(ctx, prevBlock, addr)
		if err != nil {
			startLT = 0 // account didn't exist before this range
		} else {
			startLT = accPrev.LastTxLT
		}
	} else {
		startLT = 0
	}

	return startLT, endLT, endHash, nil
}

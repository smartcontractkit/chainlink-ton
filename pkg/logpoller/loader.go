package logpoller

import (
	"bytes"
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
	lggr   logger.SugaredLogger
	client ton.APIClientWrapped
}

func NewLoader(
	client ton.APIClientWrapped,
	lggr logger.Logger,
) *Loader {
	return &Loader{
		lggr:   logger.Sugared(lggr),
		client: client,
	}
}

// TODO: block vs message
func (lc *Loader) BackfillForAddresses(ctx context.Context, addresses []*address.Address, fromSeqNo uint32, currentMaster *ton.BlockIDExt) ([]*tlb.ExternalMessageOut, error) {
	// TODO: refactor to use background workers for scale
	var allMsgs []*tlb.ExternalMessageOut
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, addr := range addresses {
		wg.Add(1)
		go func(addr *address.Address) {
			defer wg.Done()
			msgs, err := lc.fetchMessagesForAddress(ctx, addr, fromSeqNo, currentMaster)
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

func (lc *Loader) fetchMessagesForAddress(ctx context.Context, addr *address.Address, fromSeqNo uint32, currentMaster *ton.BlockIDExt) ([]*tlb.ExternalMessageOut, error) {
	accEnd, err := lc.client.GetAccount(ctx, currentMaster, addr)
	if err != nil {
		return nil, err
	}
	endLT, endHash := accEnd.LastTxLT, accEnd.LastTxHash

	var startLT uint64
	var startHash []byte
	if fromSeqNo > 1 {
		oldBlk, err := lc.client.LookupBlock(ctx, currentMaster.Workchain, currentMaster.Shard, fromSeqNo)
		if err != nil {
			return nil, fmt.Errorf("couldn't fetch the old master block %d: %w", fromSeqNo, err)
		}
		accStart, err := lc.client.GetAccount(ctx, oldBlk, addr)
		if err != nil {
			// TODO: this can be true if the account was not initialized at that block
			return nil, fmt.Errorf("couldn't get account at old block %d: %w", fromSeqNo, err)
		}
		startLT = accStart.LastTxLT
		startHash = accStart.LastTxHash
	}

	var messages []*tlb.ExternalMessageOut
	curLT, curHash := endLT, endHash

paginationLoop:
	for {
		// TODO: use pagination from lp
		batch, err := lc.client.ListTransactions(ctx, addr, 100, curLT, curHash)
		if errors.Is(err, ton.ErrNoTransactionsWereFound) {
			break
		} else if err != nil {
			return nil, fmt.Errorf("ListTransactions: %w", err)
		}
		if len(batch) == 0 {
			break
		}

		for _, tx := range batch {
			if tx.LT < startLT || (tx.LT == startLT && bytes.Equal(tx.Hash, startHash)) {
				break paginationLoop
			}
			lc.lggr.Debugw("Processing transaction", "txLT", tx.LT, "txHash", tx.Hash, "account", addr.String())
			lc.lggr.Debugf("Transaction: %s", tx.String())

			if tx.IO.Out == nil {
				lc.lggr.Debugw("Skipping transaction with nil Out", "txLT", tx.LT)
				continue
			}

			msgs, _ := tx.IO.Out.ToSlice()
			for _, msg := range msgs {
				// filter only external outgoing messages
				if msg.MsgType != tlb.MsgTypeExternalOut {
					continue
				}
				ext := msg.AsExternalOut()
				if ext.Body == nil {
					continue
				}
				messages = append(messages, ext)
			}
		}

		last := batch[len(batch)-1]
		curLT, curHash = last.PrevTxLT, last.PrevTxHash
		if len(batch) < 100 {
			break
		}
	}

	return messages, nil
}

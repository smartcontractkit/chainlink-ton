package tracetracking

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
)

const (
	// receiptPollInterval is how long findReceipt waits before looking up a block the chain has
	// not produced yet again.
	receiptPollInterval = time.Second

	// receiptPageSize is how many transactions findReceipt lists per query. A block rarely holds
	// more than a few transactions of the same account.
	receiptPageSize = 16

	// lsErrorNotReady is the liteserver error code for a block it does not have yet.
	lsErrorNotReady = 651
)

// errBlockNotProduced reports that the liteserver has no block holding a logical time yet.
var errBlockNotProduced = errors.New("block not produced yet")

// findReceipt waits for the transaction in which the destination of sent receives it.
//
// It searches the blocks of the destination's shard rather than the destination account's
// transaction history. An account's history is only reachable while the account exists, so it misses
// the transactions of a message to an address with no account (whether bounced or not) and of an
// account that destroys itself. Blocks record every transaction regardless of account state.
//
// The destination receives the message after it is created, so the search starts at the first block
// of the shard that can hold logical time sent.CreatedLT, and moves forward one block at a time,
// waiting for the blocks the chain has not produced yet, until it finds the transaction or ctx is
// done. Shard splits and merges need no handling: blocks are looked up by the destination's account
// prefix and by logical time, which always resolve to the shard holding the destination.
//
// Only a block the chain has not produced yet is waited for. Any other failure is returned, so a
// liteserver that cannot serve the search does not hold the caller until ctx is done. The search
// records its progress in sent, so a search cut short, by ctx or by a failure, resumes after the
// last block it fully searched.
func findReceipt(ctx context.Context, c ton.APIClientWrapped, sent *SentMessage) (*ReceivedMessage, error) {
	// Keep the search on one liteserver, so a block found by one is not missing on another.
	ctx = c.Client().StickyContext(ctx)

	if sent.receiptSearch.lt == 0 {
		sent.receiptSearch.lt = sent.InternalMsg.CreatedLT
	}

	for {
		tx, err := searchNextBlock(ctx, c, sent)
		if errors.Is(err, errBlockNotProduced) {
			select {
			case <-ctx.Done():
				return nil, fmt.Errorf("transaction receiving message from %s to %s at lt %d not found: %w (last error: %w)",
					sent.InternalMsg.SrcAddr, sent.InternalMsg.DstAddr, sent.InternalMsg.CreatedLT, ctx.Err(), err)
			case <-time.After(receiptPollInterval):
			}
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("failed to search for transaction receiving message from %s to %s at lt %d: %w",
				sent.InternalMsg.SrcAddr, sent.InternalMsg.DstAddr, sent.InternalMsg.CreatedLT, err)
		}
		if tx == nil {
			continue
		}

		received, err := MapToReceivedMessage(tx)
		if err != nil {
			return nil, fmt.Errorf("failed to map transaction: %w", err)
		}
		return &received, nil
	}
}

// searchNextBlock searches the block at the receipt search cursor of sent for the transaction
// receiving sent. When the block does not hold it, searchNextBlock moves the cursor past the block
// and returns nil.
func searchNextBlock(ctx context.Context, c ton.APIClientWrapped, sent *SentMessage) (*tlb.Transaction, error) {
	cur := &sent.receiptSearch

	block, err := lookupBlockByLT(ctx, c, sent.InternalMsg.DstAddr, cur.lt)
	if err != nil {
		return nil, fmt.Errorf("failed to find the next block to search: %w", err)
	}
	if cur.searched != nil && block.Equals(cur.searched) {
		// The block ending at lt is the one already searched: look past it.
		cur.lt++
		return nil, nil
	}

	tx, err := findInBlock(ctx, c, block, sent)
	if err != nil {
		return nil, fmt.Errorf("failed to search block %d: %w", block.SeqNo, err)
	}
	if tx != nil {
		return tx, nil
	}

	header, err := c.GetBlockHeader(ctx, block) //nolint:tonapiwaitlint // WaitForBlock takes a masterchain seqno; block is a shard block this sticky liteserver returned
	if err != nil {
		return nil, fmt.Errorf("failed to get header of block %d: %w", block.SeqNo, err)
	}
	cur.searched, cur.lt = block, max(header.EndLt, cur.lt+1)
	return nil, nil
}

// receiptCursor is how far findReceipt has searched for the transaction receiving a message. Blocks
// before it are known not to hold the transaction. Block IDs and logical times are the same on every
// liteserver, so the search can resume on another one.
type receiptCursor struct {
	lt       uint64          // logical time to look the next block up by; 0 before the search starts
	searched *ton.BlockIDExt // the last block fully searched
}

// findInBlock returns the transaction of block in which the destination of sent receives it, or nil
// if block does not hold it.
func findInBlock(ctx context.Context, c ton.APIClientWrapped, block *ton.BlockIDExt, sent *SentMessage) (*tlb.Transaction, error) {
	dst := sent.InternalMsg.DstAddr

	// Blocks list transactions ordered by account and then logical time, so listing after the
	// destination at the message's creation time starts at the destination's candidate transactions.
	after := &ton.TransactionID3{Account: dst.Data(), LT: sent.InternalMsg.CreatedLT}
	for {
		txs, incomplete, err := c.GetBlockTransactionsV2(ctx, block, receiptPageSize, after) //nolint:tonapiwaitlint // WaitForBlock takes a masterchain seqno; block is a shard block this sticky liteserver returned
		if err != nil {
			return nil, fmt.Errorf("failed to list transactions of block %d:%x:%d: %w", block.Workchain, uint64(block.Shard), block.SeqNo, err) //nolint:gosec // reinterpreting the shard bits
		}
		for _, info := range txs {
			if !bytes.Equal(info.Account, dst.Data()) {
				return nil, nil // past the destination's transactions
			}
			tx, err := c.GetTransaction(ctx, block, dst, info.LT) //nolint:tonapiwaitlint // WaitForBlock takes a masterchain seqno; block is a shard block this sticky liteserver returned
			if err != nil {
				return nil, fmt.Errorf("failed to get transaction %d of %s: %w", info.LT, dst, err)
			}
			if tx.IO.In != nil && tx.IO.In.MsgType == tlb.MsgTypeInternal && sent.MatchesReceived(tx.IO.In.AsInternal()) {
				return tx, nil
			}
			after = &ton.TransactionID3{Account: info.Account, LT: info.LT}
		}
		if !incomplete || len(txs) == 0 {
			return nil, nil
		}
	}
}

// lookupBlockByLT returns the first block of the shard holding addr that can hold logical time lt.
func lookupBlockByLT(ctx context.Context, c ton.APIClientWrapped, addr *address.Address, lt uint64) (*ton.BlockIDExt, error) {
	var resp tl.Serializable
	err := c.Client().QueryLiteserver(ctx, ton.LookupBlock{
		Mode: 2, // by logical time
		ID: &ton.BlockInfoShort{
			Workchain: addr.Workchain(),
			Shard:     accountShardPrefix(addr),
		},
		LT: lt,
	}, &resp)
	if err != nil {
		return nil, fmt.Errorf("failed to look up block at lt %d: %w", lt, err)
	}

	switch t := resp.(type) {
	case ton.BlockHeader:
		if t.ID == nil {
			return nil, errors.New("liteserver returned no block")
		}
		return t.ID, nil
	case ton.LSError:
		if t.Code == lsErrorNotReady {
			return nil, fmt.Errorf("no block at lt %d: %w", lt, errBlockNotProduced)
		}
		return nil, fmt.Errorf("failed to look up block at lt %d: %w", lt, t)
	}
	return nil, fmt.Errorf("failed to look up block at lt %d: unexpected response %T", lt, resp)
}

// accountShardPrefix returns the 64-bit shard prefix of addr. Liteservers resolve a block lookup by
// it to the shard holding addr, whatever the shard's depth.
func accountShardPrefix(addr *address.Address) int64 {
	return int64(binary.BigEndian.Uint64(addr.Data()[:8]) | 1) //nolint:gosec // reinterpreting the prefix bits
}

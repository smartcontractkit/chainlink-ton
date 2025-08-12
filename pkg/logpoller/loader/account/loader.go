package account

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

var _ logpoller.MessageLoader = (*accountMsgLoader)(nil)

// TODO(NONEVM-2194): replace with a block-scanning loader
// TODO(NONEVM-2188): refactor as subengine, with background workers for production scalability
type accountMsgLoader struct {
	lggr     logger.SugaredLogger // Logger for debugging and monitoring
	client   ton.APIClientWrapped // TON blockchain client
	pageSize uint32               // Number of transactions to fetch per API call
}

// NewMsgLoader creates a new MessageLoader instance
func NewMsgLoader(
	client ton.APIClientWrapped,
	lggr logger.Logger,
	pageSize uint32,
) logpoller.MessageLoader {
	// TODO(NONEVM-2188): add background worker pool initializaion here
	return &accountMsgLoader{
		lggr:     logger.Sugared(lggr),
		client:   client,
		pageSize: pageSize,
	}
}

// LoadMsgsFromSrcAddrs scans TON blockchain for external messages from specified addresses
// between prevBlock and toBlock. This MVP implementation uses concurrent goroutines
// per address for improved performance.
//
// For TON CCIP MVP, this provides sufficient throughput while keeping implementation simple.
// Production version will use background worker pools for better resource management.
//
// TODO(NONEVM-2188): refactor to use background workers for scale in production
func (lc *accountMsgLoader) LoadMsgsFromSrcAddrs(ctx context.Context, srcAddrs []*address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) ([]types.IndexedMsg, error) {
	var allMsgs []types.IndexedMsg
	var mu sync.Mutex

	eg, egCtx := errgroup.WithContext(ctx)

	lc.lggr.Debugf("scanning block range (%d, %d] for %d contracts", func() uint32 {
		if prevBlock != nil {
			return prevBlock.SeqNo
		}
		return 0
	}(), toBlock.SeqNo, len(srcAddrs))

	for _, addr := range srcAddrs {
		currAddr := addr
		eg.Go(func() error {
			msgs, err := lc.fetchMessagesForAddress(egCtx, currAddr, prevBlock, toBlock)
			if err != nil {
				return fmt.Errorf("failed to fetch for %s: %w", currAddr.String(), err)
			}
			if len(msgs) > 0 {
				mu.Lock()
				allMsgs = append(allMsgs, msgs...)
				mu.Unlock()
			}
			return nil
		})
	}

	if err := eg.Wait(); err != nil {
		return nil, err
	}

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
func (lc *accountMsgLoader) fetchMessagesForAddress(ctx context.Context, addr *address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) ([]types.IndexedMsg, error) {
	if prevBlock != nil && prevBlock.SeqNo >= toBlock.SeqNo {
		return nil, fmt.Errorf("prevBlock %d is not before toBlock %d", prevBlock.SeqNo, toBlock.SeqNo)
	}
	startLT, endLT, endHash, err := lc.getTransactionBounds(ctx, addr, prevBlock, toBlock)
	if err != nil {
		return nil, err
	}

	if startLT >= endLT {
		lc.lggr.Trace("No transactions to process", "address", addr.String(), "startLT", startLT, "endLT", endLT)
		return nil, nil
	}

	var msgsWithCtx []types.IndexedMsg
	curLT, curHash := endLT, endHash

	for {
		batch, err := lc.client.ListTransactions(ctx, addr, lc.pageSize, curLT, curHash)
		if errors.Is(err, ton.ErrNoTransactionsWereFound) || len(batch) == 0 {
			// no more transactions to process
			break
		} else if err != nil {
			return nil, fmt.Errorf("failed to list transactions for %s: %w", addr.String(), err)
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
					event := types.IndexedMsg{
						// TODO(NONEVM-2194): populate block metadata
						IndexedTx: types.IndexedTx{
							Tx: tx,
						},
						Msg: ext,
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

// getTransactionBounds determines the logical time (LT) range for scanning transactions
// between two blocks for a specific address on the TON blockchain.
//
// TON's account-based transaction model uses logical time (LT) to order transactions
// within each account's transaction chain. This allows efficient range-based scanning.
//
//	┌prevBlock─┐ ┌fromBlock─┐     ┌─toBlock──┐
//	│ TX│TX│TX │ │ TX│TX│TX │ ... │ TX│TX│TX │
//	└────────│─┘ └─│────────┘     └────────│─┘
//	         │     │ <- txs of interest -> │
//	    lastSeenLT                        endLT
//	    (startLT)
//
// prevBlock: Block where the address was last seen(already processed)
// toBlock: Block where the scan ends
func (lc *accountMsgLoader) getTransactionBounds(ctx context.Context, addr *address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) (startLT, endLT uint64, endHash []byte, err error) {
	switch {
	case prevBlock == nil:
		startLT = 0
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

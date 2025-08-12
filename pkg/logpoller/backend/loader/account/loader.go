package account

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

var _ logpoller.TxLoader = (*accountTxLoader)(nil)

// TODO(NONEVM-2188): refactor as subengine, with background workers for production scalability
type accountTxLoader struct {
	lggr     logger.SugaredLogger // Logger for debugging and monitoring
	client   ton.APIClientWrapped // TON blockchain client
	pageSize uint32               // Number of transactions to fetch per API call
}

// NewTxLoader creates a new MessageLoader instance
func NewTxLoader(
	client ton.APIClientWrapped,
	lggr logger.Logger,
	pageSize uint32,
) logpoller.TxLoader {
	// TODO(NONEVM-2188): add background worker pool initializaion here
	return &accountTxLoader{
		lggr:     logger.Sugared(lggr),
		client:   client,
		pageSize: pageSize,
	}
}

// LoadMessagesForAddresses scans TON blockchain for external messages from specified addresses
// between prevBlock and toBlock. This MVP implementation uses concurrent goroutines
// per address for improved performance.
//
// For TON CCIP MVP, this provides sufficient throughput while keeping implementation simple.
// Production version will use background worker pools for better resource management.
//
// TODO(NONEVM-2188): refactor to use background workers for scale in production
func (l *accountTxLoader) LoadTxsForAddresses(ctx context.Context, blockRange *types.BlockRange, srcAddrs []*address.Address) ([]types.TxWithBlock, error) {
	var allTxs []types.TxWithBlock
	var mu sync.Mutex

	eg, egCtx := errgroup.WithContext(ctx)

	l.lggr.Debugf("scanning block range (%d, %d] for %d contracts", func() uint32 {
		if blockRange.Prev != nil {
			return blockRange.Prev.SeqNo
		}
		return 0
	}(), blockRange.To.SeqNo, len(srcAddrs))

	for _, addr := range srcAddrs {
		currAddr := addr
		eg.Go(func() error {
			txs, err := l.fetchTxsForAddress(egCtx, currAddr, blockRange)
			if err != nil {
				return fmt.Errorf("failed to fetch for %s: %w", currAddr.String(), err)
			}
			if len(txs) > 0 {
				mu.Lock()
				allTxs = append(allTxs, txs...)
				mu.Unlock()
			}
			return nil
		})
	}

	if err := eg.Wait(); err != nil {
		return nil, err
	}

	return allTxs, nil
}

// fetchTxsForAddress retrieves external messages for a specific address within a block range.
// Uses TON's account-based transaction model with logical time (LT) bounds for efficient scanning.
//
// The method:
// 1. Determines LT bounds using account states at prevBlock and toBlock
// 2. Uses ListTransactions to paginate through the account's transaction history
// 3. Filters for ExternalMessageOut entries within the specified range
//
// Note: Block range (prevBlock, toBlock] is exclusive of prevBlock, inclusive of toBlock
// TODO: stream messages back to log poller to avoid memory overhead in production
func (l *accountTxLoader) fetchTxsForAddress(ctx context.Context, addr *address.Address, blockRange *types.BlockRange) ([]types.TxWithBlock, error) {
	if blockRange.Prev != nil && blockRange.Prev.SeqNo >= blockRange.To.SeqNo {
		return nil, fmt.Errorf("prevBlock %d is not before toBlock %d", blockRange.Prev.SeqNo, blockRange.To.SeqNo)
	}
	startLT, endLT, endHash, err := l.getTransactionBounds(ctx, addr, blockRange.Prev, blockRange.To)
	if err != nil {
		return nil, err
	}

	if startLT >= endLT {
		l.lggr.Trace("No transactions to process", "address", addr.String(), "startLT", startLT, "endLT", endLT)
		return nil, nil
	}

	var indexedTxs []types.TxWithBlock
	curLT, curHash := endLT, endHash

	for {
		batch, blocks, err := l.listTransactionsWithBlock(ctx, addr, l.pageSize, curLT, curHash)
		if errors.Is(err, ton.ErrNoTransactionsWereFound) || len(batch) == 0 {
			// no more transactions to process
			break
		} else if err != nil {
			return nil, fmt.Errorf("failed to list transactions for %s: %w", addr.String(), err)
		}

		// filter and process messages within the current batch.
		// The batch is sorted from oldest to newest.
		for i, tx := range batch {
			if tx.LT <= startLT || tx.IO.Out == nil {
				// no need to process older transactions, they are already handled.
				continue
			}

			indexedTx := types.TxWithBlock{
				Tx:    tx,
				Block: blocks[i],
			}
			indexedTxs = append(indexedTxs, indexedTx)
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

	return indexedTxs, nil
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
func (l *accountTxLoader) getTransactionBounds(ctx context.Context, addr *address.Address, prevBlock *ton.BlockIDExt, toBlock *ton.BlockIDExt) (startLT, endLT uint64, endHash []byte, err error) {
	switch {
	case prevBlock == nil:
		startLT = 0
	case prevBlock.SeqNo > 0:
		accPrev, accErr := l.client.GetAccount(ctx, prevBlock, addr)
		if accErr != nil {
			startLT = 0 // account didn't exist before this range
		} else {
			startLT = accPrev.LastTxLT
		}
	default:
		startLT = 0
	}
	// Get the account state at toBlock to find the end boundary
	res, err := l.client.WaitForBlock(toBlock.SeqNo).GetAccount(ctx, toBlock, addr)
	if err != nil {
		return 0, 0, nil, fmt.Errorf("failed to get account state for %s in block %d: %w", addr.String(), toBlock.SeqNo, err)
	}

	return startLT, res.LastTxLT, res.LastTxHash, nil
}

// ListTransactionsWithBlock is a custom version of ListTransactions that also returns the block IDs.
// It returns a list of transactions, a list of corresponding block IDs, and an error if one occurs.
func (l *accountTxLoader) listTransactionsWithBlock(ctx context.Context, addr *address.Address, limit uint32, lt uint64, txHash []byte) ([]*tlb.Transaction, []*ton.BlockIDExt, error) {
	var resp tl.Serializable
	err := l.client.Client().QueryLiteserver(ctx, ton.GetTransactions{
		Limit: int32(limit),
		AccID: &ton.AccountID{
			Workchain: addr.Workchain(),
			ID:        addr.Data(),
		},
		LT:     int64(lt),
		TxHash: txHash,
	}, &resp)
	if err != nil {
		return nil, nil, err
	}

	switch t := resp.(type) {
	case ton.TransactionList:
		if len(t.Transactions) == 0 {
			return nil, nil, ton.ErrNoTransactionsWereFound
		}

		txList, err := cell.FromBOCMultiRoot(t.Transactions)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to parse cell from transaction bytes: %w", err)
		}

		resTxs := make([]*tlb.Transaction, len(txList))
		resBlocks := make([]*ton.BlockIDExt, len(txList))

		for i := 0; i < len(txList); i++ {
			loader := txList[i].BeginParse()

			var tx tlb.Transaction
			err = tlb.LoadFromCell(&tx, loader)
			if err != nil {
				return nil, nil, fmt.Errorf("failed to load transaction from cell: %w", err)
			}
			tx.Hash = txList[i].Hash()

			if !bytes.Equal(txHash, tx.Hash) {
				return nil, nil, fmt.Errorf("incorrect transaction hash %s, not matches prev tx hash %s", tx.Hash, txHash)
			}
			txHash = tx.PrevTxHash

			reversedIdx := (len(txList) - 1) - i
			resTxs[reversedIdx] = &tx
			resBlocks[reversedIdx] = t.IDs[i]
		}
		return resTxs, resBlocks, nil
	case ton.LSError:
		if t.Code == 0 {
			return nil, nil, ton.ErrNoTransactionsWereFound
		}
		return nil, nil, t
	}

	return nil, nil, errors.New("unknown response type")
}

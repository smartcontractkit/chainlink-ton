package loader

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"math"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

var _ logpoller.TxLoader = (*rawTxLoader)(nil)

type rawTxLoader struct {
	lggr           logger.Logger                                       // Logger for debugging and monitoring
	clientProvider func(context.Context) (ton.APIClientWrapped, error) // TON blockchain client lazy getter
}

// New creates a new rawTxLoader instance
func New(
	lggr logger.Logger,
	clientProvider func(context.Context) (ton.APIClientWrapped, error),
) logpoller.TxLoader {
	return &rawTxLoader{
		lggr:           lggr,
		clientProvider: clientProvider,
	}
}

// LoadTxsForAddress retrieves transactions for a specific address within a block range.
// Uses TON's account-based transaction model with logical time (LT) bounds for efficient scanning.
//
// The method:
// 1. Determines LT bounds using account states at prevBlock and toBlock
// 2. Uses listTransactionsWithBlock to paginate through the account's transaction history
// 3. Writes loaded transactions to the provided txOut channel
//
// Note: Block range (prevBlock, toBlock] is exclusive of prevBlock, inclusive of toBlock
// This method executes synchronously - the caller should spawn goroutines for concurrent loading.
func (l *rawTxLoader) LoadTxsForAddress(ctx context.Context, blockRange *models.BlockRange, addr *address.Address, pageSize uint32, txOut chan<- models.Tx, errOut chan<- error) error {
	// Validation: prevBlock must be before toBlock
	if blockRange.FromSeqNo() >= blockRange.ToSeqNo() {
		return fmt.Errorf("prevBlock %d is not before toBlock %d", blockRange.FromSeqNo(), blockRange.ToSeqNo())
	}

	// Get transaction bounds
	startLT, endLT, endHash, err := l.GetTransactionLTBounds(ctx, blockRange, addr)
	if err != nil {
		return fmt.Errorf("failed to get transaction bounds for %s: %w", addr.String(), err)
	}

	if startLT >= endLT {
		// not an error, just a no-op
		return nil
	}

	curLT, curHash := endLT, endHash

	for {
		batch, batchBlocks, err := l.listTransactionsWithBlock(ctx, addr, pageSize, curLT, curHash)
		if errors.Is(err, ton.ErrNoTransactionsWereFound) || len(batch) == 0 {
			// no more transactions to process
			break
		} else if err != nil {
			l.lggr.Errorw("failed to list transactions for address", "address", addr.String(), "error", err)
			errOut <- fmt.Errorf("failed to list transactions for address %s: %w", addr.String(), err)
			return nil // don't block other addresses
		}

		// The batch is sorted from oldest to newest.
		for i, tx := range batch {
			if tx.LT <= startLT {
				// no need to process older transactions, they are already handled.
				continue
			}

			if tx.IO.Out == nil {
				// no need to process transactions without output messages
				continue
			}

			select {
			case txOut <- models.Tx{
				Transaction: tx,
				Block:       batchBlocks[i],
			}:
			case <-ctx.Done():
				return ctx.Err()
			}
		}

		// The oldest transaction in this batch determines if we need to fetch more pages
		// and where the next page cursor should start
		oldestTx := batch[0]

		// if it's already older than our start point, we don't need to fetch any more pages.
		if oldestTx.LT <= startLT {
			break
		}

		// move the cursor to just before the oldest tx in this batch,
		// so next page picks up right where this one left off
		curLT, curHash = oldestTx.PrevTxLT, oldestTx.PrevTxHash
	}

	return nil
}

// GetTransactionLTBounds determines the logical time (LT) range for scanning transactions
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
func (l *rawTxLoader) GetTransactionLTBounds(ctx context.Context, blockRange *models.BlockRange, addr *address.Address) (startLT, endLT uint64, endHash []byte, err error) {
	client, err := l.clientProvider(ctx)
	if err != nil {
		return 0, 0, nil, fmt.Errorf("failed to get client: %w", err)
	}
	switch {
	case blockRange.Prev == nil:
		startLT = 0
	case blockRange.FromSeqNo() > 0:
		accPrev, accErr := client.GetAccount(ctx, blockRange.Prev, addr)
		if accErr != nil {
			startLT = 0 // account didn't exist before this range
		} else {
			startLT = accPrev.LastTxLT
		}
	default:
		startLT = 0
	}

	// Get the account state at toBlock to find the end boundary
	res, err := client.WaitForBlock(blockRange.ToSeqNo()).GetAccount(ctx, blockRange.To, addr)
	if err != nil {
		return 0, 0, nil, fmt.Errorf("failed to get account state for %s in block %d: %w", addr.String(), blockRange.ToSeqNo(), err)
	}
	return startLT, res.LastTxLT, res.LastTxHash, nil
}

// GetTxsForAddress is a synchronous convenience wrapper that collects all transactions
// for an address in a block range and returns them as a slice.
//
// Warning: Be cautious about memory pressure when querying large ranges of blocks.
// For large ranges, consider using LoadTxsForAddress with streaming to process
// transactions incrementally.
func (l *rawTxLoader) GetTxsForAddress(ctx context.Context, blockRange *models.BlockRange, addr *address.Address, pageSize uint32) ([]models.Tx, error) {
	txOut := make(chan models.Tx)
	errOut := make(chan error, 1)

	var txs []models.Tx
	done := make(chan struct{})

	// Collect results in goroutine
	go func() {
		defer close(done)
		for tx := range txOut {
			txs = append(txs, tx)
		}
	}()

	// Load transactions
	err := l.LoadTxsForAddress(ctx, blockRange, addr, pageSize, txOut, errOut)
	close(txOut)

	// Wait for collection to complete
	<-done

	// Check for immediate errors
	if err != nil {
		return nil, err
	}

	// Check for runtime errors
	select {
	case err := <-errOut:
		return nil, err
	default:
		return txs, nil
	}
}

// ListTransactionsWithBlock is a custom version of ListTransactions that also returns the shard block IDs.
// It returns a list of transactions, a list of corresponding block IDs, and an error if one occurs.
// ListTransactions - returns list of transactions before (including) passed lt and hash, the oldest one is first in result slice
// Transactions will be verified to match final tx hash, which should be taken from proved account state, then it is safe.
func (l *rawTxLoader) listTransactionsWithBlock(ctx context.Context, addr *address.Address, limit uint32, lt uint64, txHash []byte) ([]*tlb.Transaction, []*ton.BlockIDExt, error) {
	// unlikely to have overflow, but just for safety
	if limit > math.MaxInt32 {
		return nil, nil, fmt.Errorf("limit %d exceeds maximum int32 value", limit)
	}
	if lt > math.MaxInt64 {
		return nil, nil, fmt.Errorf("logical time %d exceeds maximum int64 value", lt)
	}

	var resp tl.Serializable
	// Query TON blockchain for transactions. Note: API returns transactions in NEW to OLD order
	// (newest transaction first, oldest last in the response)
	client, cerr := l.clientProvider(ctx)
	if cerr != nil {
		return nil, nil, fmt.Errorf("failed to get client: %w", cerr)
	}
	err := client.Client().QueryLiteserver(ctx, ton.GetTransactions{
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

		if err = validateTransactionListResponse(len(txList), len(t.IDs), limit); err != nil {
			return nil, nil, err
		}

		resTxs := make([]*tlb.Transaction, len(txList))
		resBlocks := make([]*ton.BlockIDExt, len(txList))

		// Process transactions in reverse order to validate chain integrity as we walk backwards (NEWEST -> OLDEST)
		// he txHash parameter is what we're expecting to find, while tx.Hash is what we actually got.
		//
		// Chain validation pattern:
		// TX100: compare txHash (parameter - cursor from LoadTxsForAddress) with tx.Hash
		// TX99:  compare tx.PrevTxHash (from TX100) with tx.Hash
		// TX98:  compare tx.PrevTxHash (from TX99) with tx.Hash
		//
		// We don't use tx.PrevTxHash directly for the first iteration because there's no previous
		// transaction we've processed yet - we need the txHash parameter from our cursor.
		// After the first iteration, txHash gets updated to tx.PrevTxHash for the next comparison.
		for i := 0; i < len(txList); i++ {
			loader := txList[i].BeginParse()

			var tx tlb.Transaction
			err = tlb.LoadFromCell(&tx, loader)
			if err != nil {
				return nil, nil, fmt.Errorf("failed to load transaction from cell: %w", err)
			}
			tx.Hash = txList[i].Hash()

			// validate chain integrity: ensure the hash we expected matches what we got
			if !bytes.Equal(txHash, tx.Hash) {
				return nil, nil, fmt.Errorf("incorrect transaction hash %s, not matches prev tx hash %s", tx.Hash, txHash)
			}
			// update txHash for next iteration's validation
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

// validateTransactionListResponse validates liteserver response to prevent DoS attacks.
// checks that response doesn't exceed requested limit and that block IDs array matches transaction count (runtime panic prevention).
func validateTransactionListResponse(txCount, idsCount int, limit uint32) error {
	if txCount > int(limit) {
		return fmt.Errorf("liteserver returned %d transactions, exceeding requested limit %d", txCount, limit)
	}
	if idsCount != txCount {
		return fmt.Errorf("block IDs count (%d) does not match transaction count (%d)", idsCount, txCount)
	}
	return nil
}

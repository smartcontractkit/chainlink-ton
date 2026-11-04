package loader

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// mockAPIClient is a minimal ton.APIClientWrapped implementation for loader tests.
type mockAPIClient struct {
	ton.APIClientWrapped // embed to satisfy the interface
	accountFunc          func(block *ton.BlockIDExt) (*tlb.Account, error)
	liteClient           *mockLiteClient
}

func (m *mockAPIClient) GetAccount(_ context.Context, block *ton.BlockIDExt, _ *address.Address) (*tlb.Account, error) {
	return m.accountFunc(block)
}

func (m *mockAPIClient) Client() ton.LiteClient {
	return m.liteClient
}

func (m *mockAPIClient) WaitForBlock(_ uint32) ton.APIClientWrapped {
	return m
}

// mockLiteClient mocks the LiteClient interface, letting tests control QueryLiteserver responses.
type mockLiteClient struct {
	ton.LiteClient
	queryFunc func(ctx context.Context, req, resp tl.Serializable) error
}

func (m *mockLiteClient) QueryLiteserver(ctx context.Context, req tl.Serializable, resp tl.Serializable) error {
	return m.queryFunc(ctx, req, resp)
}

// makeTestTx builds a serializable transaction with the given LT and previous-tx link.
func makeTestTx(t *testing.T, lt uint64, prevTxLT uint64, prevTxHash []byte) (*tlb.Transaction, *cell.Cell) {
	t.Helper()

	tx := &tlb.Transaction{
		AccountAddr: make([]byte, 32),
		LT:          lt,
		PrevTxLT:    prevTxLT,
		PrevTxHash:  prevTxHash,
		Now:         1700000000,
		OrigStatus:  tlb.AccountStatusActive,
		EndStatus:   tlb.AccountStatusActive,
		TotalFees:   tlb.CurrencyCollection{Coins: tlb.ZeroCoins},
		StateUpdate: tlb.HashUpdate{OldHash: make([]byte, 32), NewHash: make([]byte, 32)},
		Description: tlb.TransactionDescriptionOrdinary{
			ComputePhase: tlb.ComputePhase{
				Phase: tlb.ComputePhaseSkipped{Reason: tlb.ComputeSkipReason{Type: tlb.ComputeSkipReasonNoState}},
			},
		},
	}

	c, err := tx.ToCell()
	require.NoError(t, err)
	return tx, c
}

// makeTransactionListResponse builds a liteserver TransactionList response for the given txs.
func makeTransactionListResponse(t *testing.T, txs ...*cell.Cell) ton.TransactionList {
	t.Helper()

	ids := make([]*ton.BlockIDExt, len(txs))
	for i := range ids {
		ids[i] = &ton.BlockIDExt{
			Workchain: 0,
			Shard:     1,
			SeqNo:     100,
			RootHash:  make([]byte, 32),
			FileHash:  make([]byte, 32),
		}
	}

	return ton.TransactionList{
		IDs: ids,
		// CRC32C matches what a real liteserver returns.
		Transactions: cell.ToBOCWithOptions(txs, cell.BOCSerializeOptions{WithCRC32C: true}),
	}
}

// TestLoadTxsForAddress_PageErrorIsReported is a regression test for the loader silently
// treating liteserver failures as "no more transactions".
//
// Before the fix, the loop checked `errors.Is(err, ErrNoTransactionsWereFound) || len(batch) == 0`
// before `err != nil`. Since every error return yields a nil batch, any liteserver error
// (timeout, rate limit, LSError, broken hash chain) broke out of the loop as if the account's
// history had ended. Nothing was sent to errOut, so processBlockRange saw no load errors and
// run() advanced the checkpoint past transactions that were never indexed.
func TestLoadTxsForAddress_PageErrorIsReported(t *testing.T) {
	t.Parallel()

	addr := address.NewAddress(0, 0, make([]byte, 32))

	// First page succeeds and contains one tx; the second page fails.
	firstPageTx, firstPageCell := makeTestTx(t, 200, 100, make([]byte, 32))

	blockRange := &models.BlockRange{
		Prev: &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 1},
		To:   &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 10},
	}

	var calls int
	liteClient := &mockLiteClient{
		queryFunc: func(_ context.Context, _ tl.Serializable, resp tl.Serializable) error {
			calls++
			if calls == 1 {
				*resp.(*tl.Serializable) = makeTransactionListResponse(t, firstPageCell)
				return nil
			}
			return errors.New("liteserver timeout")
		},
	}

	client := &mockAPIClient{
		accountFunc: func(block *ton.BlockIDExt) (*tlb.Account, error) {
			if block.SeqNo == blockRange.To.SeqNo {
				return &tlb.Account{
					IsActive:   true,
					LastTxLT:   firstPageTx.LT,
					LastTxHash: firstPageCell.Hash(),
				}, nil
			}
			// prev block: account exists with an older last tx, so startLT < endLT
			return &tlb.Account{IsActive: true, LastTxLT: 100}, nil
		},
		liteClient: liteClient,
	}

	l := &rawTxLoader{
		lggr: logger.Sugared(logger.Nop()),
		clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
			return client, nil
		},
	}

	txOut := make(chan models.Tx, 10)
	errOut := make(chan error, 10)

	err := l.LoadTxsForAddress(t.Context(), blockRange, addr, 10, txOut, errOut)
	require.NoError(t, err, "LoadTxsForAddress reports page errors via errOut, not its return value")

	require.Equal(t, 2, calls, "loader should have attempted a second page")

	select {
	case loadErr := <-errOut:
		require.ErrorContains(t, loadErr, "liteserver timeout")
	default:
		t.Fatal("page error was swallowed: nothing sent to errOut, so the caller would advance the checkpoint")
	}
}

// TestLoadTxsForAddress_NoTransactionsIsNotAnError verifies the legitimate end-of-history
// signal (ErrNoTransactionsWereFound) still terminates the loop without reporting an error.
func TestLoadTxsForAddress_NoTransactionsIsNotAnError(t *testing.T) {
	t.Parallel()

	addr := address.NewAddress(0, 0, make([]byte, 32))

	blockRange := &models.BlockRange{
		Prev: &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 1},
		To:   &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 10},
	}

	liteClient := &mockLiteClient{
		queryFunc: func(_ context.Context, _ tl.Serializable, resp tl.Serializable) error {
			*resp.(*tl.Serializable) = ton.LSError{Code: 0}
			return nil
		},
	}

	client := &mockAPIClient{
		accountFunc: func(block *ton.BlockIDExt) (*tlb.Account, error) {
			if block.SeqNo == blockRange.To.SeqNo {
				return &tlb.Account{IsActive: true, LastTxLT: 200, LastTxHash: make([]byte, 32)}, nil
			}
			return &tlb.Account{IsActive: true, LastTxLT: 100}, nil
		},
		liteClient: liteClient,
	}

	l := &rawTxLoader{
		lggr: logger.Sugared(logger.Nop()),
		clientProvider: func(_ context.Context) (ton.APIClientWrapped, error) {
			return client, nil
		},
	}

	txOut := make(chan models.Tx, 10)
	errOut := make(chan error, 10)

	err := l.LoadTxsForAddress(t.Context(), blockRange, addr, 10, txOut, errOut)
	require.NoError(t, err)

	select {
	case loadErr := <-errOut:
		t.Fatalf("end-of-history must not be reported as an error, got: %v", loadErr)
	default:
	}
}

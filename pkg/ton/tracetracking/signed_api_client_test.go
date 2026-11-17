package tracetracking

import (
	"context"
	"encoding/binary"
	"errors"
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// lookupMockAPI is a node holding a wallet's transaction history, oldest first.
type lookupMockAPI struct {
	ton.APIClientWrapped
	history   []*tlb.Transaction
	blockTime time.Time
	listErr   error // returned by ListTransactions for any page but the newest
}

func (m *lookupMockAPI) CurrentMasterchainInfo(context.Context) (*ton.BlockIDExt, error) {
	return &ton.BlockIDExt{Workchain: address.MasterchainID, Shard: math.MinInt64, SeqNo: 10}, nil
}

func (m *lookupMockAPI) WaitForBlock(uint32) ton.APIClientWrapped { return m }

func (m *lookupMockAPI) GetBlockShardsInfo(context.Context, *ton.BlockIDExt) ([]*ton.BlockIDExt, error) {
	return []*ton.BlockIDExt{{Workchain: 0, Shard: math.MinInt64, SeqNo: 20}}, nil
}

func (m *lookupMockAPI) GetBlockHeader(_ context.Context, block *ton.BlockIDExt) (*tlb.BlockHeader, error) {
	if block.Workchain != 0 {
		return nil, errors.New("expected the wallet's shard block")
	}
	return &tlb.BlockHeader{GenUtime: uint32(m.blockTime.Unix())}, nil //nolint:gosec // test clock
}

func (m *lookupMockAPI) GetAccount(context.Context, *ton.BlockIDExt, *address.Address) (*tlb.Account, error) {
	if len(m.history) == 0 {
		return &tlb.Account{}, nil
	}
	last := m.history[len(m.history)-1]
	return &tlb.Account{IsActive: true, LastTxLT: last.LT, LastTxHash: last.Hash}, nil
}

func (m *lookupMockAPI) ListTransactions(_ context.Context, _ *address.Address, num uint32, lt uint64, _ []byte) ([]*tlb.Transaction, error) {
	if m.listErr != nil && lt != m.history[len(m.history)-1].LT {
		return nil, m.listErr
	}
	for i, tx := range m.history {
		if tx.LT == lt {
			return m.history[max(0, i+1-int(num)) : i+1], nil
		}
	}
	return nil, ton.ErrNoTransactionsWereFound
}

func TestFindExternalTransaction(t *testing.T) {
	t.Parallel()

	wallet0 := address.MustParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	newExt := func(i uint64) *tlb.ExternalMessage {
		return &tlb.ExternalMessage{DstAddr: wallet0, Body: cell.BeginCell().MustStoreUInt(i, 64).EndCell()}
	}
	now := time.Now().Truncate(time.Second)

	// history of n wallet transactions, one per second up to now, the i-th processing newExt(i)
	newHistory := func(n int) []*tlb.Transaction {
		history := make([]*tlb.Transaction, n)
		for i := range history {
			ext := newExt(uint64(i))
			tx := &tlb.Transaction{
				LT:        uint64(100 + i),
				Now:       uint32(now.Add(time.Duration(i-n+1) * time.Second).Unix()), //nolint:gosec // test clock
				TotalFees: tlb.CurrencyCollection{Coins: tlb.ZeroCoins},
			}
			tx.Hash = binary.BigEndian.AppendUint64(nil, tx.LT)
			if i > 0 {
				tx.PrevTxLT, tx.PrevTxHash = history[i-1].LT, history[i-1].Hash
			}
			tx.IO.In = &tlb.Message{MsgType: tlb.MsgTypeExternalIn, Msg: &tlb.ExternalMessageIn{
				DstAddr: ext.DstAddr, ImportFee: tlb.ZeroCoins, Body: ext.Body,
			}}
			history[i] = tx
		}
		return history
	}

	tests := []struct {
		name    string
		history []*tlb.Transaction
		listErr error
		ext     *tlb.ExternalMessage
		after   time.Time
		wantLT  uint64 // 0: not found
		wantErr bool
	}{
		{name: "found in the newest page", history: newHistory(40), ext: newExt(39), after: now.Add(-time.Hour), wantLT: 139},
		{name: "found in an older page", history: newHistory(40), ext: newExt(3), after: now.Add(-time.Hour), wantLT: 103},
		{name: "not found in the whole history", history: newHistory(40), ext: newExt(99), after: now.Add(-time.Hour)},
		{name: "not looked for before after", history: newHistory(40), ext: newExt(3), after: now.Add(-10 * time.Second)},
		{name: "inactive wallet", ext: newExt(0), after: now.Add(-time.Hour)},
		{
			name: "node lacks older transactions", history: newHistory(40), ext: newExt(3), after: now.Add(-time.Hour),
			listErr: errors.New("cannot compute block with specified transaction: lt not in db"), wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			blockTime := now.Add(2 * time.Second)
			api := &lookupMockAPI{history: tt.history, blockTime: blockTime, listErr: tt.listErr}
			c := NewSignedAPIClient(api, wallet.Wallet{})

			found, coveredUntil, err := c.FindExternalTransaction(t.Context(), tt.ext, tt.after)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, blockTime, coveredUntil, "the lookup covers the wallet's shard block in its view")
			if tt.wantLT == 0 {
				require.Nil(t, found)
				return
			}
			require.NotNil(t, found)
			require.Equal(t, tt.wantLT, found.LamportTime)
		})
	}
}

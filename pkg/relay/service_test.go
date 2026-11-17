package relay

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	tontypes "github.com/smartcontractkit/chainlink-common/pkg/types/chains/ton"

	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

type fakeChain struct {
	Chain
	client ton.APIClientWrapped
	txm    *fakeTxManager
}

func (c *fakeChain) ID() string                                              { return "test" }
func (c *fakeChain) GetClient(context.Context) (ton.APIClientWrapped, error) { return c.client, nil }
func (c *fakeChain) TxManager() TxManager                                    { return c.txm }

type fakeTxManager struct {
	TxManager
	wallet   wallet.Wallet
	enqueued []txm.Request
}

func (m *fakeTxManager) GetClient(context.Context) (tracetracking.SignedAPIClient, error) {
	return tracetracking.SignedAPIClient{Wallet: m.wallet}, nil
}

func (m *fakeTxManager) Enqueue(r txm.Request) error {
	m.enqueued = append(m.enqueued, r)
	return nil
}

type fakeAPIClient struct {
	ton.APIClientWrapped
	lookup      *ton.BlockIDExt
	lookupErr   error
	gotAccount  *ton.BlockIDExt
	gotBlockReq *ton.BlockIDExt
	waitedFor   []uint32
}

func (c *fakeAPIClient) LookupBlock(_ context.Context, wc int32, shard int64, seqNo uint32) (*ton.BlockIDExt, error) {
	if c.lookupErr != nil {
		return nil, c.lookupErr
	}
	if c.lookup != nil {
		return c.lookup, nil
	}
	return &ton.BlockIDExt{Workchain: wc, Shard: shard, SeqNo: seqNo, RootHash: bytes.Repeat([]byte{1}, 32), FileHash: bytes.Repeat([]byte{2}, 32)}, nil
}

func (c *fakeAPIClient) WaitForBlock(seqNo uint32) ton.APIClientWrapped {
	c.waitedFor = append(c.waitedFor, seqNo)
	return c
}

func (c *fakeAPIClient) GetAccount(_ context.Context, block *ton.BlockIDExt, _ *address.Address) (*tlb.Account, error) {
	c.gotAccount = block
	return &tlb.Account{IsActive: true, State: &tlb.AccountState{AccountStorage: tlb.AccountStorage{Balance: tlb.MustFromTON("1.5")}}}, nil
}

func (c *fakeAPIClient) GetBlockData(_ context.Context, block *ton.BlockIDExt) (*tlb.Block, error) {
	c.gotBlockReq = block
	return &tlb.Block{GlobalID: -239}, nil
}

func newTestService(t *testing.T, client *fakeAPIClient) (*Service, *fakeTxManager) {
	_, key, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)
	w, err := wallet.FromPrivateKeyWithOptions(key, tonconfig.WalletVersion)
	require.NoError(t, err)
	tm := &fakeTxManager{wallet: *w}
	s := NewService(&fakeChain{client: client, txm: tm})
	return &s, tm
}

func TestSendTx(t *testing.T) {
	to := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c")
	body := cell.BeginCell().MustStoreUInt(42, 32).EndCell().ToBOC()

	tests := []struct {
		name    string
		msg     tontypes.Message
		wantErr string
	}{
		{name: "valid with body", msg: tontypes.Message{ToAddress: to.String(), Amount: "0.5", Body: body}},
		{name: "valid without body and state init", msg: tontypes.Message{ToAddress: to.String(), Amount: "1"}},
		{name: "malformed amount", msg: tontypes.Message{ToAddress: to.String(), Amount: "abc"}, wantErr: "failed parsing msg.Amount"},
		{name: "empty amount", msg: tontypes.Message{ToAddress: to.String(), Amount: ""}, wantErr: "failed parsing msg.Amount"},
		{name: "negative amount", msg: tontypes.Message{ToAddress: to.String(), Amount: "-1"}, wantErr: "must be positive"},
		{name: "zero amount", msg: tontypes.Message{ToAddress: to.String(), Amount: "0"}, wantErr: "must be positive"},
		{name: "malformed body", msg: tontypes.Message{ToAddress: to.String(), Amount: "1", Body: []byte{1, 2, 3}}, wantErr: "failed parsing msg.Body"},
		{name: "malformed state init", msg: tontypes.Message{ToAddress: to.String(), Amount: "1", StateInit: []byte{1, 2, 3}}, wantErr: "failed parsing msg.StateInit"},
		{name: "empty non-nil state init", msg: tontypes.Message{ToAddress: to.String(), Amount: "1", StateInit: []byte{}}, wantErr: "failed parsing msg.StateInit"},
		{name: "empty non-nil body", msg: tontypes.Message{ToAddress: to.String(), Amount: "1", Body: []byte{}}, wantErr: "failed parsing msg.Body"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, tm := newTestService(t, &fakeAPIClient{})
			err := s.SendTx(t.Context(), tt.msg)
			if tt.wantErr != "" {
				require.ErrorContains(t, err, tt.wantErr)
				require.Empty(t, tm.enqueued)
				return
			}
			require.NoError(t, err)
			require.Len(t, tm.enqueued, 1)
			require.Equal(t, tlb.MustFromTON(tt.msg.Amount).Nano(), tm.enqueued[0].Amount.Nano())
			require.Nil(t, tm.enqueued[0].StateInit)
		})
	}
}

func TestBlockRequestsUseResolvedBlockID(t *testing.T) {
	block := &tontypes.BlockIDExt{Workchain: -1, Shard: -9223372036854775808, SeqNo: 77}
	addr := "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"

	t.Run("account balance", func(t *testing.T) {
		client := &fakeAPIClient{}
		s, _ := newTestService(t, client)
		bal, err := s.GetAccountBalance(t.Context(), addr, block)
		require.NoError(t, err)
		require.Equal(t, tlb.MustFromTON("1.5").Nano(), bal.Balance)
		require.Len(t, client.gotAccount.RootHash, 32)
		require.Len(t, client.gotAccount.FileHash, 32)
		require.Equal(t, block.SeqNo, client.gotAccount.SeqNo)
		require.Equal(t, []uint32{block.SeqNo}, client.waitedFor)
	})

	t.Run("block data", func(t *testing.T) {
		client := &fakeAPIClient{}
		s, _ := newTestService(t, client)
		_, err := s.GetBlockData(t.Context(), block)
		require.NoError(t, err)
		require.Len(t, client.gotBlockReq.RootHash, 32)
		require.Equal(t, []uint32{block.SeqNo}, client.waitedFor)
	})

	t.Run("lookup error", func(t *testing.T) {
		s, _ := newTestService(t, &fakeAPIClient{lookupErr: errors.New("boom")})
		_, err := s.GetAccountBalance(t.Context(), addr, block)
		require.ErrorContains(t, err, "failed to look up block")
	})

	t.Run("lookup returns block without hashes", func(t *testing.T) {
		s, _ := newTestService(t, &fakeAPIClient{lookup: &ton.BlockIDExt{Workchain: -1, SeqNo: 77}})
		_, err := s.GetBlockData(t.Context(), block)
		require.ErrorContains(t, err, "invalid block ID")
	})

	t.Run("nil block", func(t *testing.T) {
		s, _ := newTestService(t, &fakeAPIClient{})
		_, err := s.GetBlockData(t.Context(), nil)
		require.ErrorContains(t, err, "block is nil")
	})
}

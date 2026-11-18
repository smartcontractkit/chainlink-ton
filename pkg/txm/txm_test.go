package txm

import (
	"context"
	"crypto/ed25519"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

type slowAPIClient struct {
	ton.APIClientWrapped
	delay   time.Duration
	entered chan struct{}
	release chan struct{}
}

func (c *slowAPIClient) CurrentMasterchainInfo(context.Context) (*ton.BlockIDExt, error) {
	return &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 1}, nil
}

func (c *slowAPIClient) WaitForBlock(uint32) ton.APIClientWrapped { return c }

func (c *slowAPIClient) GetAccount(context.Context, *ton.BlockIDExt, *address.Address) (*tlb.Account, error) {
	if c.entered != nil {
		close(c.entered)
		<-c.release
	}
	time.Sleep(c.delay)
	return &tlb.Account{
		IsActive: true,
		State:    &tlb.AccountState{AccountStorage: tlb.AccountStorage{Balance: tlb.MustFromTON("100")}},
	}, nil
}

func newStartedTestTxm(t *testing.T, client *slowAPIClient) (*Txm, *wallet.Wallet) {
	_, key, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)
	w, err := wallet.FromPrivateKeyWithOptions(key, tonconfig.WalletVersion)
	require.NoError(t, err)

	signed := tracetracking.NewSignedAPIClient(client, *w)
	cfg := DefaultConfigSet
	cfg.BroadcastChanSize = 1000
	tm, err := New(logger.Test(t), "test", nil, func(context.Context) (tracetracking.SignedAPIClient, error) {
		return signed, nil
	}, cfg)
	require.NoError(t, err)
	// Without starting the loops, enqueued txs stay in the channel and are never broadcast.
	require.NoError(t, tm.starter.StartOnce("Txm", func() error { return nil }))
	return tm, w
}

func TestEnqueueConcurrentWithClose(t *testing.T) {
	tm, w := newStartedTestTxm(t, &slowAPIClient{delay: 20 * time.Millisecond})

	var wg sync.WaitGroup
	for range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = tm.Enqueue(Request{FromWallet: *w, ContractAddress: *w.WalletAddress(), Amount: tlb.MustFromTON("0.1")})
		}()
	}
	time.Sleep(5 * time.Millisecond)
	require.NoError(t, tm.Close())
	wg.Wait()

	require.Error(t, tm.Enqueue(Request{FromWallet: *w, ContractAddress: *w.WalletAddress(), Amount: tlb.MustFromTON("0.1")}))
}

func TestEnqueueResumingAfterCloseFails(t *testing.T) {
	client := &slowAPIClient{entered: make(chan struct{}), release: make(chan struct{})}
	tm, w := newStartedTestTxm(t, client)

	errCh := make(chan error, 1)
	go func() {
		errCh <- tm.Enqueue(Request{FromWallet: *w, ContractAddress: *w.WalletAddress(), Amount: tlb.MustFromTON("0.1")})
	}()
	<-client.entered
	require.NoError(t, tm.Close())
	close(client.release)

	require.ErrorContains(t, <-errCh, "txm stopped")
	require.Empty(t, tm.broadcastChan)
}

func TestNewWalletMessageStateInit(t *testing.T) {
	to := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c")
	base := Tx{From: *to, To: *to, Amount: tlb.MustFromTON("0.1"), CreatedAt: time.Now()}

	t.Run("no state init", func(t *testing.T) {
		msg, err := newWalletMessage(&base)
		require.NoError(t, err)
		require.Nil(t, msg.InternalMessage.StateInit)
	})

	t.Run("with state init", func(t *testing.T) {
		code := cell.BeginCell().MustStoreUInt(1, 8).EndCell()
		data := cell.BeginCell().MustStoreUInt(2, 8).EndCell()
		si, err := tlb.ToCell(&tlb.StateInit{Code: code, Data: data})
		require.NoError(t, err)
		tx := base
		tx.StateInit = si

		msg, err := newWalletMessage(&tx)
		require.NoError(t, err)
		require.NotNil(t, msg.InternalMessage.StateInit)
		require.Equal(t, code.Hash(), msg.InternalMessage.StateInit.Code.Hash())
		require.Equal(t, data.Hash(), msg.InternalMessage.StateInit.Data.Hash())
	})

	t.Run("malformed state init", func(t *testing.T) {
		tx := base
		tx.StateInit = cell.BeginCell().MustStoreUInt(0xff, 8).EndCell()
		_, err := newWalletMessage(&tx)
		require.ErrorContains(t, err, "failed to parse StateInit")
	})
}

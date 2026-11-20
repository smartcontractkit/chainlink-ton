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
	base := Tx{From: *to, To: *to, Amount: tlb.MustFromTON("0.1"), CreatedAt: time.Unix(1_700_000_000, 0)}

	t.Run("no state init", func(t *testing.T) {
		msg, err := newWalletMessage(&base)
		require.NoError(t, err)
		require.Nil(t, msg.InternalMessage.StateInit)
		require.Equal(t, uint32(1_700_000_000), msg.InternalMessage.CreatedAt)
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

	t.Run("accepted by highload v3 wallet", func(t *testing.T) {
		_, key, err := ed25519.GenerateKey(nil)
		require.NoError(t, err)
		w, err := wallet.FromPrivateKeyWithOptions(key, tonconfig.WalletVersion)
		require.NoError(t, err)

		code := cell.BeginCell().MustStoreUInt(1, 8).EndCell()
		si, err := tlb.ToCell(&tlb.StateInit{Code: code, Data: code})
		require.NoError(t, err)
		withStateInit := base
		withStateInit.StateInit = si
		fromWallet := base
		fromWallet.From = *w.WalletAddress()

		for name, tx := range map[string]Tx{"no state init": fromWallet, "with state init": withStateInit} {
			t.Run(name, func(t *testing.T) {
				msg, err := newWalletMessage(&tx)
				require.NoError(t, err)
				ext, err := w.PrepareExternalMessageForMany(t.Context(), false, []*wallet.Message{msg})
				require.NoError(t, err)
				requireHighloadV3Sendable(t, ext.Body)
			})
		}
	})

	t.Run("malformed state init", func(t *testing.T) {
		tx := base
		tx.StateInit = cell.BeginCell().MustStoreUInt(0xff, 8).EndCell()
		_, err := newWalletMessage(&tx)
		require.ErrorContains(t, err, "failed to parse StateInit")
	})
}

// requireHighloadV3Sendable mirrors the checks highload-wallet-v3 runs on message_to_send after
// commit(); failing any of them throws error::invalid_message_to_send (37) and the message is dropped.
func requireHighloadV3Sendable(t *testing.T, extBody *cell.Cell) {
	t.Helper()
	body, err := extBody.BeginParse()
	require.NoError(t, err)
	payload, err := body.LoadRef()
	require.NoError(t, err)
	_, err = payload.LoadUInt(32) // subwallet_id
	require.NoError(t, err)
	msgToSend, err := payload.LoadRef()
	require.NoError(t, err)

	tag, err := msgToSend.LoadUInt(1)
	require.NoError(t, err)
	require.Zero(t, tag, "message_to_send must be int_msg_info$0")
	_, err = msgToSend.LoadUInt(3) // ihr_disabled, bounce, bounced
	require.NoError(t, err)
	src, err := msgToSend.LoadAddr()
	require.NoError(t, err)
	require.Equal(t, address.NoneAddress, src.Type(), "message_to_send src must be addr_none")
	_, err = msgToSend.LoadAddr() // dest
	require.NoError(t, err)
	_, err = msgToSend.LoadCoins()
	require.NoError(t, err)
	_, err = msgToSend.LoadDict(32) // extra currencies
	require.NoError(t, err)
	_, err = msgToSend.LoadCoins() // ihr_fee
	require.NoError(t, err)
	_, err = msgToSend.LoadCoins() // fwd_fee
	require.NoError(t, err)
	_, err = msgToSend.LoadUInt(64 + 32) // created_lt, created_at
	require.NoError(t, err)
	hasStateInit, err := msgToSend.LoadBoolBit()
	require.NoError(t, err)
	require.False(t, hasStateInit, "message_to_send must not carry a state init")
}

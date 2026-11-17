package txm

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

var errRejected = errors.New("failed to send message: lite server error, code -701: cannot apply external message")

// sendResult controls one SendExternalMessageWaitTransaction call: whether the message lands
// on-chain and what the call returns.
type sendResult struct {
	land bool
	err  error
}

type broadcastFakeClient struct {
	ton.APIClientWrapped

	mu       sync.Mutex
	results  []sendResult
	sent     []string
	landed   map[string]bool
	findErrs int
}

func (c *broadcastFakeClient) CurrentMasterchainInfo(context.Context) (*ton.BlockIDExt, error) {
	return &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 1}, nil
}

func (c *broadcastFakeClient) WaitForBlock(uint32) ton.APIClientWrapped { return c }

func (c *broadcastFakeClient) GetAccount(context.Context, *ton.BlockIDExt, *address.Address) (*tlb.Account, error) {
	return &tlb.Account{
		IsActive: true,
		State: &tlb.AccountState{AccountStorage: tlb.AccountStorage{
			Status:  tlb.AccountStatusActive,
			Balance: tlb.MustFromTON("100"),
		}},
	}, nil
}

func (c *broadcastFakeClient) SendExternalMessageWaitTransaction(_ context.Context, ext *tlb.ExternalMessage) (*tlb.Transaction, *ton.BlockIDExt, []byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	hash := hex.EncodeToString(ext.Body.Hash())
	res := c.results[len(c.sent)]
	c.sent = append(c.sent, hash)
	if res.land {
		c.landed[hash] = true
	}
	if res.err != nil {
		return nil, nil, nil, res.err
	}
	return walletTx(), nil, ext.Body.Hash(), nil
}

func (c *broadcastFakeClient) FindLastTransactionByInMsgHash(_ context.Context, _ *address.Address, msgHash []byte, _ ...int) (*tlb.Transaction, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.findErrs > 0 {
		c.findErrs--
		return nil, errors.New("liteserver unavailable")
	}
	if c.landed[hex.EncodeToString(msgHash)] {
		return walletTx(), nil
	}
	return nil, ton.ErrTxWasNotFound
}

func walletTx() *tlb.Transaction {
	return &tlb.Transaction{
		LT: 1000,
		IO: struct {
			In  *tlb.Message      `tlb:"maybe ^"`
			Out *tlb.MessagesList `tlb:"maybe ^"`
		}{In: &tlb.Message{MsgType: tlb.MsgTypeExternalIn, Msg: &tlb.ExternalMessageIn{}}},
	}
}

func setupBroadcast(t *testing.T, client *broadcastFakeClient) (*Txm, *Tx, *wallet.Message) {
	client.landed = map[string]bool{}
	_, key, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)
	w, err := wallet.FromPrivateKey(client, key, tonconfig.WalletVersion)
	require.NoError(t, err)

	cfg := DefaultConfigSet
	cfg.SendRetryDelay = config.MustNewDuration(time.Millisecond)
	cfg.EnableTraceLogging = new(false)
	signed := tracetracking.NewSignedAPIClient(client, *w)
	tm, err := New(logger.Test(t), "test", nil, func(context.Context) (tracetracking.SignedAPIClient, error) {
		return signed, nil
	}, cfg)
	require.NoError(t, err)

	to := w.WalletAddress()
	tx := &Tx{From: *to, To: *to, Amount: tlb.MustFromTON("0.1"), CreatedAt: time.Now(), Expiration: time.Now().Add(time.Minute)}
	msg := &wallet.Message{Mode: wallet.PayGasSeparately, InternalMessage: &tlb.InternalMessage{
		IHRDisabled: true, Bounce: true, DstAddr: to, Amount: tx.Amount,
	}}
	return tm, tx, msg
}

func requireTracked(t *testing.T, tm *Txm) {
	signed, err := tm.clientProvider(t.Context())
	require.NoError(t, err)
	require.Len(t, tm.accountStore.GetTxStore(signed.Wallet.Address().String()).GetUnconfirmed(), 1)
}

func TestBroadcastWithRetry(t *testing.T) {
	t.Run("timed out attempt that landed is not sent again", func(t *testing.T) {
		client := &broadcastFakeClient{results: []sendResult{{land: true, err: context.DeadlineExceeded}}}
		tm, tx, msg := setupBroadcast(t, client)

		require.NoError(t, tm.broadcastWithRetry(t.Context(), tx, msg, "id"))
		require.Len(t, client.sent, 1)
		requireTracked(t, tm)
	})

	t.Run("retry resends the same signed message", func(t *testing.T) {
		client := &broadcastFakeClient{results: []sendResult{{err: errors.New("boom")}, {land: true}}}
		tm, tx, msg := setupBroadcast(t, client)

		require.NoError(t, tm.broadcastWithRetry(t.Context(), tx, msg, "id"))
		require.Len(t, client.sent, 2)
		require.Equal(t, client.sent[0], client.sent[1])
		requireTracked(t, tm)
	})

	t.Run("rejected resend of a landed message counts as success", func(t *testing.T) {
		client := &broadcastFakeClient{
			results:  []sendResult{{land: true, err: context.DeadlineExceeded}, {err: errRejected}},
			findErrs: 1,
		}
		tm, tx, msg := setupBroadcast(t, client)

		require.NoError(t, tm.broadcastWithRetry(t.Context(), tx, msg, "id"))
		require.Len(t, client.sent, 2)
		require.Equal(t, client.sent[0], client.sent[1])
		requireTracked(t, tm)
	})

	t.Run("rejected message that never landed fails without retrying", func(t *testing.T) {
		client := &broadcastFakeClient{results: []sendResult{{err: errRejected}}}
		tm, tx, msg := setupBroadcast(t, client)

		require.ErrorContains(t, tm.broadcastWithRetry(t.Context(), tx, msg, "id"), "rejected by TON node")
		require.Len(t, client.sent, 1)
	})

	t.Run("expired message that never landed is re-signed", func(t *testing.T) {
		orig := externalMessageValidity
		externalMessageValidity = 0
		t.Cleanup(func() { externalMessageValidity = orig })

		client := &broadcastFakeClient{results: []sendResult{{err: context.DeadlineExceeded}, {land: true}}}
		tm, tx, msg := setupBroadcast(t, client)

		require.NoError(t, tm.broadcastWithRetry(t.Context(), tx, msg, "id"))
		require.Len(t, client.sent, 2)
		require.NotEqual(t, client.sent[0], client.sent[1])
		requireTracked(t, tm)
	})

	t.Run("unexpired message is never re-signed", func(t *testing.T) {
		results := make([]sendResult, DefaultConfigSet.MaxSendRetryAttempts)
		for i := range results {
			results[i] = sendResult{err: context.DeadlineExceeded}
		}
		client := &broadcastFakeClient{results: results}
		tm, tx, msg := setupBroadcast(t, client)

		require.Error(t, tm.broadcastWithRetry(t.Context(), tx, msg, "id"))
		require.Len(t, client.sent, len(results))
		for _, h := range client.sent {
			require.Equal(t, client.sent[0], h)
		}
	})
}

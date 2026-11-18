package txm

import (
	"context"
	"crypto/ed25519"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

// errStall makes a mocked call block until its context is done.
var errStall = errors.New("stall")

// errRejected mimics the liteserver error for an external message the wallet did not accept.
var errRejected = errors.New("lite server error, code -701: cannot apply external message to current state")

// sentMessage records one external message handed to SendExternalMessageWaitTransaction.
type sentMessage struct {
	hash      string
	at        time.Time
	expiresAt time.Time // from the signed payload
}

// broadcastMockAPI is a ton.APIClientWrapped that records sent external messages and keeps the
// wallet's transaction history, as seen by a node whose view may lag. Methods not used by the
// broadcast path are left unimplemented.
type broadcastMockAPI struct {
	ton.APIClientWrapped

	mu      sync.Mutex
	sends   []sentMessage
	lookups int
	history []*tlb.Transaction          // wallet transactions, oldest first
	onChain map[string]*tlb.Transaction // normalized external message hash -> wallet transaction

	// send decides the outcome of the n-th send (0-based) of a message: whether the message is
	// processed on chain, and the error the send returns (nil returns its transaction).
	send func(n int, ext *tlb.ExternalMessage) (processed bool, err error)
	// lookupErr, if set, returns the error of the n-th lookup (0-based): nil looks the message up,
	// and errStall blocks the lookup until its context is done.
	lookupErr func(n int) error
	// view, if set, returns the time of the newest wallet shard block the node has; transactions
	// made after it are not visible. It defaults to now.
	view func() time.Time
}

func newBroadcastMockAPI(send func(n int, ext *tlb.ExternalMessage) (bool, error)) *broadcastMockAPI {
	return &broadcastMockAPI{onChain: map[string]*tlb.Transaction{}, send: send}
}

func (m *broadcastMockAPI) CurrentMasterchainInfo(context.Context) (*ton.BlockIDExt, error) {
	return &ton.BlockIDExt{Workchain: address.MasterchainID, Shard: math.MinInt64, SeqNo: 1}, nil
}

func (m *broadcastMockAPI) WaitForBlock(uint32) ton.APIClientWrapped { return m }

func (m *broadcastMockAPI) GetBlockShardsInfo(context.Context, *ton.BlockIDExt) ([]*ton.BlockIDExt, error) {
	return []*ton.BlockIDExt{{Workchain: 0, Shard: math.MinInt64, SeqNo: 1}}, nil
}

// GetBlockHeader is only called by lookups, so it counts them.
func (m *broadcastMockAPI) GetBlockHeader(ctx context.Context, _ *ton.BlockIDExt) (*tlb.BlockHeader, error) {
	m.mu.Lock()
	n := m.lookups
	m.lookups++
	var err error
	if m.lookupErr != nil {
		err = m.lookupErr(n)
	}
	view := m.viewTime()
	m.mu.Unlock()

	if errors.Is(err, errStall) {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	if err != nil {
		return nil, err
	}
	return &tlb.BlockHeader{GenUtime: view}, nil
}

func (m *broadcastMockAPI) GetAccount(context.Context, *ton.BlockIDExt, *address.Address) (*tlb.Account, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	acc := &tlb.Account{
		IsActive: true,
		State:    &tlb.AccountState{IsValid: true, AccountStorage: tlb.AccountStorage{Status: tlb.AccountStatusActive}},
	}
	if visible := m.visible(); len(visible) > 0 {
		last := visible[len(visible)-1]
		acc.LastTxLT, acc.LastTxHash = last.LT, last.Hash
	}
	return acc, nil
}

func (m *broadcastMockAPI) ListTransactions(_ context.Context, _ *address.Address, num uint32, lt uint64, _ []byte) ([]*tlb.Transaction, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	visible := m.visible()
	for i, tx := range visible {
		if tx.LT == lt {
			return visible[max(0, i+1-int(num)) : i+1], nil
		}
	}
	return nil, ton.ErrNoTransactionsWereFound
}

func (m *broadcastMockAPI) SendExternalMessageWaitTransaction(ctx context.Context, ext *tlb.ExternalMessage) (*tlb.Transaction, *ton.BlockIDExt, []byte, error) {
	// tonutils queries the node before sending, which fails once ctx is done
	if err := ctx.Err(); err != nil {
		return nil, nil, nil, err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	hash := string(ext.NormalizedHash())
	n := len(m.sends)
	_, expiresAt, err := tonconfig.HighloadV3MessageWindow(ext)
	if err != nil {
		return nil, nil, nil, err
	}
	m.sends = append(m.sends, sentMessage{hash: hash, at: time.Now(), expiresAt: expiresAt})

	processed, err := m.send(n, ext)
	if processed && m.onChain[hash] == nil {
		m.onChain[hash] = m.addWalletTx(ext)
	}
	if err != nil {
		return nil, nil, nil, err
	}
	tx := m.onChain[hash]
	if tx == nil {
		return nil, nil, nil, errors.New("test misconfigured: send succeeded without processing the message")
	}
	return tx, &ton.BlockIDExt{SeqNo: 2}, ext.Body.Hash(), nil
}

// addWalletTx appends a successful wallet transaction processing ext to the history.
func (m *broadcastMockAPI) addWalletTx(ext *tlb.ExternalMessage) *tlb.Transaction {
	tx := &tlb.Transaction{
		LT:        uint64(1000 + len(m.history)),
		Now:       uint32(time.Now().Unix()), //nolint:gosec // test clock
		TotalFees: tlb.CurrencyCollection{Coins: tlb.ZeroCoins},
		Description: tlb.TransactionDescriptionOrdinary{
			ComputePhase: tlb.ComputePhase{Phase: tlb.ComputePhaseVM{Success: true, GasFees: tlb.ZeroCoins}},
			ActionPhase:  &tlb.ActionPhase{Success: true},
		},
	}
	tx.Hash = binary.BigEndian.AppendUint64(nil, tx.LT)
	if len(m.history) > 0 {
		prev := m.history[len(m.history)-1]
		tx.PrevTxLT, tx.PrevTxHash = prev.LT, prev.Hash
	}
	tx.IO.In = &tlb.Message{MsgType: tlb.MsgTypeExternalIn, Msg: &tlb.ExternalMessageIn{
		DstAddr:   ext.DstAddr,
		ImportFee: tlb.ZeroCoins,
		Body:      ext.Body,
	}}
	m.history = append(m.history, tx)
	return tx
}

// viewTime returns the time of the newest wallet shard block the node has, in seconds.
func (m *broadcastMockAPI) viewTime() uint32 {
	view := time.Now()
	if m.view != nil {
		view = m.view()
	}
	return uint32(view.Unix()) //nolint:gosec // test clock
}

// visible returns the wallet transactions the node has, oldest first.
func (m *broadcastMockAPI) visible() []*tlb.Transaction {
	view := m.viewTime()
	n := 0
	for n < len(m.history) && m.history[n].Now <= view {
		n++
	}
	return m.history[:n]
}

func (m *broadcastMockAPI) sent() []sentMessage {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]sentMessage(nil), m.sends...)
}

func (m *broadcastMockAPI) txFor(hash string) *tlb.Transaction {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.onChain[hash]
}

// shortLivedWallet is a HighloadV3 config whose messages expire between one and two seconds after
// being built (created_at has a resolution of one second).
func shortLivedWallet() wallet.ConfigHighloadV3 {
	var queryID atomic.Uint32
	return wallet.ConfigHighloadV3{
		MessageTTL: 6, // the shortest tonutils allows
		MessageBuilder: func(context.Context, uint32) (uint32, int64, error) {
			return queryID.Add(1), time.Now().Unix() - 4, nil
		},
	}
}

// newBroadcastTestTxm returns a Txm broadcasting from a HighloadV3 wallet with config walletCfg.
// signDelay, if set, returns how long the n-th (0-based) signing takes.
func newBroadcastTestTxm(t *testing.T, api *broadcastMockAPI, walletCfg wallet.ConfigHighloadV3, signDelay func(n int) time.Duration) (*Txm, *wallet.Wallet) {
	t.Helper()

	_, key, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)
	var signs atomic.Int32
	signer := func(ctx context.Context, toSign *cell.Cell, _ uint32) ([]byte, error) {
		n := int(signs.Add(1)) - 1
		if signDelay != nil {
			select {
			case <-time.After(signDelay(n)):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		return ed25519.Sign(key, toSign.Hash()), nil
	}
	w, err := wallet.FromPrivateKeyWithOptions(key, walletCfg, wallet.WithAPI(api), wallet.WithSigner(signer))
	require.NoError(t, err)

	cfg := DefaultConfigSet
	cfg.EnableTraceLogging = new(false)
	cfg.SendRetryDelay = config.MustNewDuration(time.Millisecond)
	cfg.MaxSendRetryAttempts = 50

	txm, err := New(logger.Test(t), "test", nil, func(context.Context) (tracetracking.SignedAPIClient, error) {
		return tracetracking.NewSignedAPIClient(api, *w), nil
	}, cfg)
	require.NoError(t, err)
	txm.messageClockSkew = 100 * time.Millisecond
	return txm, w
}

// requireSentInWindow checks that no message was sent once the wallet may consider it expired.
func requireSentInWindow(t *testing.T, sends []sentMessage, clockSkew time.Duration) {
	t.Helper()
	for i, s := range sends {
		require.Truef(t, s.at.Before(s.expiresAt.Add(-clockSkew)),
			"send %d at %s is past its message's send window, which closes at %s", i, s.at, s.expiresAt.Add(-clockSkew))
	}
}

func newBroadcastTestTx(t *testing.T) (*Tx, *wallet.Message) {
	t.Helper()
	to := address.MustParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	tx := &Tx{
		To:         *to,
		Amount:     tlb.MustFromTON("0.1"),
		CreatedAt:  time.Now(),
		Expiration: time.Now().Add(time.Minute),
	}
	msg := &wallet.Message{
		Mode:            wallet.PayGasSeparately,
		InternalMessage: &tlb.InternalMessage{DstAddr: to, Amount: tx.Amount},
	}
	return tx, msg
}

func distinctMessages(sends []sentMessage) []string {
	var hashes []string
	seen := map[string]bool{}
	for _, s := range sends {
		if !seen[s.hash] {
			seen[s.hash] = true
			hashes = append(hashes, s.hash)
		}
	}
	return hashes
}

func TestBroadcastWithRetry_RetryDelay(t *testing.T) {
	t.Parallel()

	const attempts = 15
	api := newBroadcastMockAPI(func(n int, _ *tlb.ExternalMessage) (bool, error) {
		if n < attempts-1 {
			return false, errors.New("node unavailable")
		}
		return true, nil
	})
	txm, _ := newBroadcastTestTxm(t, api, tonconfig.WalletVersion, nil)
	txm.config.MaxSendRetryAttempts = attempts
	txm.config.MaxSendRetryDelay = config.MustNewDuration(time.Millisecond)
	tx, msg := newBroadcastTestTx(t)

	start := time.Now()
	require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

	require.Len(t, api.sent(), attempts)
	// uncapped, the delays before the last attempts would take seconds
	require.Less(t, time.Since(start), time.Second, "delays between attempts must be capped at MaxSendRetryDelay")
}

func TestBroadcastWithRetry_ExternalMessageReuse(t *testing.T) {
	t.Parallel()

	t.Run("re-sends the same message after a timeout", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(n int, _ *tlb.ExternalMessage) (bool, error) {
			if n == 0 {
				return false, context.DeadlineExceeded
			}
			return true, nil
		})
		txm, w := newBroadcastTestTxm(t, api, tonconfig.WalletVersion, nil)
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

		sends := api.sent()
		require.Len(t, sends, 2)
		require.Len(t, distinctMessages(sends), 1, "the retry must re-send the same external message")
		require.Equal(t, api.txFor(sends[0].hash).LT, tx.ReceivedMessage.LamportTime)
		require.Len(t, txm.accountStore.GetTxStore(w.Address().String()).GetUnconfirmed(), 1)
	})

	t.Run("uses the transaction of a message processed after its attempt timed out", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(n int, _ *tlb.ExternalMessage) (bool, error) {
			return true, context.DeadlineExceeded // processed, but the wait timed out
		})
		txm, _ := newBroadcastTestTxm(t, api, tonconfig.WalletVersion, nil)
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

		sends := api.sent()
		require.Len(t, sends, 1, "the processed message must not be broadcast again")
		require.Equal(t, api.txFor(sends[0].hash).LT, tx.ReceivedMessage.LamportTime)
	})

	t.Run("a rejected re-send of an already processed message is a success", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(n int, _ *tlb.ExternalMessage) (bool, error) {
			if n == 0 {
				return false, context.DeadlineExceeded
			}
			// processed in the meantime, so the wallet rejects the re-send as a replay
			return true, fmt.Errorf("failed to send message: %w", errRejected)
		})
		txm, _ := newBroadcastTestTxm(t, api, tonconfig.WalletVersion, nil)
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

		sends := api.sent()
		require.Len(t, sends, 2)
		require.Len(t, distinctMessages(sends), 1)
		require.Equal(t, api.txFor(sends[0].hash).LT, tx.ReceivedMessage.LamportTime)
	})

	t.Run("a rejection is not final while it is unknown whether the message was processed", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(n int, _ *tlb.ExternalMessage) (bool, error) {
			if n == 0 {
				return false, context.DeadlineExceeded
			}
			// processed in the meantime, so the wallet rejects the re-send as a replay
			return true, fmt.Errorf("failed to send message: %w", errRejected)
		})
		// lookups: before the re-send (not found), after its rejection (fails), next attempt (found)
		api.lookupErr = func(n int) error {
			if n == 1 {
				return errors.New("liteserver unavailable")
			}
			return nil
		}
		txm, _ := newBroadcastTestTxm(t, api, tonconfig.WalletVersion, nil)
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

		sends := api.sent()
		require.Len(t, distinctMessages(sends), 1)
		require.Equal(t, api.txFor(sends[0].hash).LT, tx.ReceivedMessage.LamportTime)
	})

	t.Run("a rejected message that was never processed fails the broadcast", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(int, *tlb.ExternalMessage) (bool, error) {
			return false, fmt.Errorf("failed to send message: %w", errRejected)
		})
		txm, _ := newBroadcastTestTxm(t, api, tonconfig.WalletVersion, nil)
		tx, msg := newBroadcastTestTx(t)

		err := txm.broadcastWithRetry(t.Context(), tx, msg, "id")
		require.ErrorContains(t, err, "likely due to insufficient balance")
		require.Len(t, api.sent(), 1)
	})

	t.Run("a message is not replaced while the node's view may miss its transaction", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(n int, _ *tlb.ExternalMessage) (bool, error) {
			return n == 0, context.DeadlineExceeded // the first send is processed, but its wait times out
		})
		// the node's view lags until well after the message expired by the local clock
		start := time.Now()
		api.view = func() time.Time {
			if time.Since(start) < 3*time.Second {
				return start.Add(-time.Second)
			}
			return time.Now()
		}
		txm, _ := newBroadcastTestTxm(t, api, shortLivedWallet(), nil)
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

		sends := api.sent()
		require.Len(t, distinctMessages(sends), 1, "the processed message must not be replaced")
		require.Equal(t, api.txFor(sends[0].hash).LT, tx.ReceivedMessage.LamportTime)
	})

	t.Run("a new message is built only after the previous one can no longer be accepted", func(t *testing.T) {
		t.Parallel()
		var firstHash string
		api := newBroadcastMockAPI(func(n int, ext *tlb.ExternalMessage) (bool, error) {
			hash := string(ext.NormalizedHash())
			if n == 0 {
				firstHash = hash
			}
			if hash == firstHash {
				return false, context.DeadlineExceeded // the first message is never processed
			}
			return true, nil
		})
		txm, _ := newBroadcastTestTxm(t, api, shortLivedWallet(), nil)
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

		sends := api.sent()
		require.Len(t, distinctMessages(sends), 2, "exactly one replacement message")
		requireSentInWindow(t, sends, txm.messageClockSkew)
		firstExpiresAt := sends[0].expiresAt
		for _, s := range sends {
			if s.hash != firstHash {
				require.False(t, s.at.Before(firstExpiresAt),
					"the replacement must not be sent while the first message could still be accepted")
			}
		}
	})

	t.Run("a message whose send window closed while it was being signed is not sent", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(int, *tlb.ExternalMessage) (bool, error) { return true, nil })
		// the first signing outlasts the message's validity
		txm, _ := newBroadcastTestTxm(t, api, shortLivedWallet(), func(n int) time.Duration {
			if n == 0 {
				return 2100 * time.Millisecond
			}
			return 0
		})
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

		sends := api.sent()
		require.Len(t, sends, 1)
		requireSentInWindow(t, sends, txm.messageClockSkew)
	})

	t.Run("a stalled signer is bounded by SendTimeout", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(int, *tlb.ExternalMessage) (bool, error) { return true, nil })
		txm, _ := newBroadcastTestTxm(t, api, tonconfig.WalletVersion, func(n int) time.Duration {
			if n == 0 {
				return time.Hour
			}
			return 0
		})
		txm.config.SendTimeout = config.MustNewDuration(200 * time.Millisecond)
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))
		require.Len(t, api.sent(), 1)
	})

	t.Run("stalled lookups are bounded by SendTimeout", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(n int, _ *tlb.ExternalMessage) (bool, error) {
			if n == 0 {
				return false, context.DeadlineExceeded
			}
			// processed in the meantime, so the wallet rejects the re-send as a replay
			return true, fmt.Errorf("failed to send message: %w", errRejected)
		})
		// lookups: before the re-send and after its rejection stall; the next attempt's finds it
		api.lookupErr = func(n int) error {
			if n < 2 {
				return errStall
			}
			return nil
		}
		txm, _ := newBroadcastTestTxm(t, api, tonconfig.WalletVersion, nil)
		txm.config.SendTimeout = config.MustNewDuration(200 * time.Millisecond)
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))
		sends := api.sent()
		require.Len(t, distinctMessages(sends), 1)
		require.Equal(t, api.txFor(sends[0].hash).LT, tx.ReceivedMessage.LamportTime)
	})

	t.Run("a rejected re-send is not final while the node may not have the message's transaction", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(n int, _ *tlb.ExternalMessage) (bool, error) {
			if n == 0 {
				return true, context.DeadlineExceeded // processed, but the wait timed out
			}
			// the wallet rejects the re-send as a replay
			return true, fmt.Errorf("failed to send message: %w", errRejected)
		})
		// lookups find nothing, without failing, until well after the message expired
		start := time.Now()
		api.view = func() time.Time {
			if time.Since(start) < 3*time.Second {
				return start.Add(-time.Second)
			}
			return time.Now()
		}
		txm, _ := newBroadcastTestTxm(t, api, shortLivedWallet(), nil)
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

		sends := api.sent()
		require.Greater(t, len(sends), 1, "the message must have been re-sent")
		require.Len(t, distinctMessages(sends), 1)
		require.Equal(t, api.txFor(sends[0].hash).LT, tx.ReceivedMessage.LamportTime)
	})

	t.Run("a message processed after the attempts ran out is a success", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(n int, _ *tlb.ExternalMessage) (bool, error) {
			return n == 1, context.DeadlineExceeded // the last attempt's send is processed, but its wait times out
		})
		txm, w := newBroadcastTestTxm(t, api, shortLivedWallet(), nil)
		txm.config.MaxSendRetryAttempts = 2
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

		sends := api.sent()
		require.Len(t, sends, 2)
		require.Len(t, distinctMessages(sends), 1)
		require.Equal(t, api.txFor(sends[0].hash).LT, tx.ReceivedMessage.LamportTime)
		require.Len(t, txm.accountStore.GetTxStore(w.Address().String()).GetUnconfirmed(), 1)
	})

	t.Run("running out of attempts fails once the message can no longer be processed", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(int, *tlb.ExternalMessage) (bool, error) {
			return false, context.DeadlineExceeded
		})
		txm, _ := newBroadcastTestTxm(t, api, shortLivedWallet(), nil)
		txm.config.MaxSendRetryAttempts = 2
		tx, msg := newBroadcastTestTx(t)

		err := txm.broadcastWithRetry(t.Context(), tx, msg, "id")
		require.ErrorIs(t, err, context.DeadlineExceeded)
		require.NotErrorIs(t, err, errOutcomeUnknown)
		sends := api.sent()
		require.False(t, time.Now().Before(sends[len(sends)-1].expiresAt), "the failure must wait for the message to expire")
	})

	t.Run("running out of attempts while the node's view lags reports an unknown outcome", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(int, *tlb.ExternalMessage) (bool, error) {
			return false, context.DeadlineExceeded
		})
		start := time.Now()
		api.view = func() time.Time { return start.Add(-time.Hour) }
		txm, _ := newBroadcastTestTxm(t, api, shortLivedWallet(), nil)
		txm.config.MaxSendRetryAttempts = 2
		tx, msg := newBroadcastTestTx(t)

		require.ErrorIs(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"), errOutcomeUnknown)
	})

	t.Run("a message processed before the transaction expired is a success", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(n int, _ *tlb.ExternalMessage) (bool, error) {
			time.Sleep(100 * time.Millisecond) // outlasts the transaction's expiration
			return n == 0, context.DeadlineExceeded
		})
		txm, w := newBroadcastTestTxm(t, api, shortLivedWallet(), nil)
		tx, msg := newBroadcastTestTx(t)
		tx.Expiration = time.Now().Add(50 * time.Millisecond)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

		sends := api.sent()
		require.Len(t, sends, 1)
		require.Equal(t, api.txFor(sends[0].hash).LT, tx.ReceivedMessage.LamportTime)

		// it is tracked for the full TxExpiration from its broadcast, though its deadline passed
		txStore := txm.accountStore.GetTxStore(w.Address().String())
		unconfirmed := txStore.GetUnconfirmed()
		require.Len(t, unconfirmed, 1)
		trackedUntil := tx.BroadcastAt.Add(txm.config.TxExpiration.Duration())
		require.Equal(t, uint64(trackedUntil.UnixMilli()), unconfirmed[0].ExpirationMs)
		_, expired := txm.accountStore.CleanupAll(uint64(time.Now().UnixMilli()))
		require.Empty(t, expired)
		require.Len(t, txStore.GetUnconfirmed(), 1)
	})

	t.Run("a transaction that expired before its message was processed fails as expired", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(int, *tlb.ExternalMessage) (bool, error) {
			time.Sleep(100 * time.Millisecond) // outlasts the transaction's expiration
			return false, context.DeadlineExceeded
		})
		txm, _ := newBroadcastTestTxm(t, api, shortLivedWallet(), nil)
		tx, msg := newBroadcastTestTx(t)
		tx.Expiration = time.Now().Add(50 * time.Millisecond)

		require.ErrorIs(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"), errTxExpired)
		require.Len(t, api.sent(), 1)
	})

	t.Run("a wallet other than HighloadV3 is refused", func(t *testing.T) {
		t.Parallel()
		api := newBroadcastMockAPI(func(int, *tlb.ExternalMessage) (bool, error) { return true, nil })
		_, key, err := ed25519.GenerateKey(nil)
		require.NoError(t, err)
		w, err := wallet.FromPrivateKeyWithOptions(key, wallet.V4R2, wallet.WithAPI(api))
		require.NoError(t, err)
		txm, err := New(logger.Test(t), "test", nil, func(context.Context) (tracetracking.SignedAPIClient, error) {
			return tracetracking.NewSignedAPIClient(api, *w), nil
		}, DefaultConfigSet)
		require.NoError(t, err)
		tx, msg := newBroadcastTestTx(t)

		require.ErrorContains(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"), "requires a HighloadV3 wallet")
		require.Empty(t, api.sent())
	})
}

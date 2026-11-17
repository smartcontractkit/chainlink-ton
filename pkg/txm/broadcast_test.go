package txm

import (
	"context"
	"crypto/ed25519"
	"errors"
	"fmt"
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

// errRejected mimics the liteserver error for an external message the wallet did not accept.
var errRejected = errors.New("lite server error, code -701: cannot apply external message to current state")

// sentMessage records one external message handed to SendExternalMessageWaitTransaction.
type sentMessage struct {
	hash string
	at   time.Time
}

// broadcastMockAPI is a ton.APIClientWrapped that records sent external messages and keeps
// the wallet transactions of the messages that are "on chain". Methods not used by the
// broadcast path are left unimplemented.
type broadcastMockAPI struct {
	ton.APIClientWrapped

	mu      sync.Mutex
	sends   []sentMessage
	lookups int
	onChain map[string]*tlb.Transaction // normalized external message hash -> wallet transaction
	nextLT  uint64

	// send decides the outcome of the n-th send (0-based) of a message: whether the message is
	// processed on chain, and the error the send returns (nil returns its transaction).
	send func(n int, ext *tlb.ExternalMessage) (processed bool, err error)
	// lookupErr, if set, returns the error of the n-th lookup (0-based); nil looks the message up.
	lookupErr func(n int) error
}

func newBroadcastMockAPI(send func(n int, ext *tlb.ExternalMessage) (bool, error)) *broadcastMockAPI {
	return &broadcastMockAPI{onChain: map[string]*tlb.Transaction{}, nextLT: 1000, send: send}
}

func (m *broadcastMockAPI) CurrentMasterchainInfo(context.Context) (*ton.BlockIDExt, error) {
	return &ton.BlockIDExt{Workchain: address.MasterchainID, SeqNo: 1}, nil
}

func (m *broadcastMockAPI) WaitForBlock(uint32) ton.APIClientWrapped { return m }

func (m *broadcastMockAPI) GetAccount(context.Context, *ton.BlockIDExt, *address.Address) (*tlb.Account, error) {
	return &tlb.Account{
		IsActive: true,
		State:    &tlb.AccountState{IsValid: true, AccountStorage: tlb.AccountStorage{Status: tlb.AccountStatusActive}},
	}, nil
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
	m.sends = append(m.sends, sentMessage{hash: hash, at: time.Now()})

	processed, err := m.send(n, ext)
	if processed && m.onChain[hash] == nil {
		m.onChain[hash] = m.newWalletTx()
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

func (m *broadcastMockAPI) FindLastTransactionByInMsgHashAfterTime(_ context.Context, _ *address.Address, msgHash []byte, _ time.Time) (*tlb.Transaction, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	n := m.lookups
	m.lookups++
	if m.lookupErr != nil {
		if err := m.lookupErr(n); err != nil {
			return nil, err
		}
	}
	if tx := m.onChain[string(msgHash)]; tx != nil {
		return tx, nil
	}
	return nil, fmt.Errorf("not found: %w", ton.ErrTxWasNotFound)
}

// newWalletTx returns a successful wallet transaction for an external message.
func (m *broadcastMockAPI) newWalletTx() *tlb.Transaction {
	m.nextLT++
	tx := &tlb.Transaction{
		LT:        m.nextLT,
		TotalFees: tlb.CurrencyCollection{Coins: tlb.ZeroCoins},
		Description: tlb.TransactionDescriptionOrdinary{
			ComputePhase: tlb.ComputePhase{Phase: tlb.ComputePhaseVM{Success: true, GasFees: tlb.ZeroCoins}},
			ActionPhase:  &tlb.ActionPhase{Success: true},
		},
	}
	tx.IO.In = &tlb.Message{MsgType: tlb.MsgTypeExternalIn, Msg: &tlb.ExternalMessageIn{ImportFee: tlb.ZeroCoins}}
	return tx
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

func newBroadcastTestTxm(t *testing.T, api *broadcastMockAPI) (*Txm, *wallet.Wallet) {
	t.Helper()

	_, key, err := ed25519.GenerateKey(nil)
	require.NoError(t, err)
	w, err := wallet.FromPrivateKeyWithOptions(key, tonconfig.WalletVersion, wallet.WithAPI(api))
	require.NoError(t, err)

	cfg := DefaultConfigSet
	cfg.EnableTraceLogging = new(false)
	cfg.SendRetryDelay = config.MustNewDuration(time.Millisecond)
	cfg.MaxSendRetryAttempts = 50

	txm, err := New(logger.Test(t), "test", nil, func(context.Context) (tracetracking.SignedAPIClient, error) {
		return tracetracking.NewSignedAPIClient(api, *w), nil
	}, cfg)
	require.NoError(t, err)
	return txm, w
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
		txm, w := newBroadcastTestTxm(t, api)
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
		txm, _ := newBroadcastTestTxm(t, api)
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
		txm, _ := newBroadcastTestTxm(t, api)
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
		txm, _ := newBroadcastTestTxm(t, api)
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
		txm, _ := newBroadcastTestTxm(t, api)
		tx, msg := newBroadcastTestTx(t)

		err := txm.broadcastWithRetry(t.Context(), tx, msg, "id")
		require.ErrorContains(t, err, "likely due to insufficient balance")
		require.Len(t, api.sent(), 1)
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
		txm, _ := newBroadcastTestTxm(t, api)
		txm.messageValidity = 300 * time.Millisecond
		txm.messageClockSkew = 100 * time.Millisecond
		tx, msg := newBroadcastTestTx(t)

		require.NoError(t, txm.broadcastWithRetry(t.Context(), tx, msg, "id"))

		sends := api.sent()
		hashes := distinctMessages(sends)
		require.Len(t, hashes, 2, "exactly one replacement message")

		firstSentAt := sends[0].at
		for _, s := range sends {
			if s.hash == firstHash {
				require.Less(t, s.at.Sub(firstSentAt), txm.messageValidity-txm.messageClockSkew,
					"the first message must not be re-sent once the wallet may consider it expired")
			} else {
				require.GreaterOrEqual(t, s.at.Sub(firstSentAt), txm.messageValidity+txm.messageClockSkew,
					"the replacement must not be sent while the first message could still be accepted")
			}
		}
	})
}

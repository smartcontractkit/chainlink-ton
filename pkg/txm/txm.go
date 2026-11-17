package txm

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/smartcontractkit/chainlink-common/pkg/timeutil"
	commontypes "github.com/smartcontractkit/chainlink-common/pkg/types"
	"github.com/smartcontractkit/chainlink-common/pkg/types/core"
	commonutils "github.com/smartcontractkit/chainlink-common/pkg/utils"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug"
	sequenceDiagram "github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/visualizations/sequence"
	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

// broadcastLookupClockSkew is the tolerance for the chain's clock (block times) differing from
// the local wall clock when deciding whether a broadcast message can still be accepted and
// which wallet transactions it could have produced.
const broadcastLookupClockSkew = 30 * time.Second

// walletGas accounts for the extra balance used when sending a message with [wallet.PayGasSeparately] mode.
func walletGas(request Request) *tlb.Coins {
	tonValue := tlb.MustFromTON("0.01")
	return &tonValue
}

type TxManager interface {
	services.Service
	Enqueue(request Request) error
	GetTransactionStatus(ctx context.Context, lt uint64) (commontypes.TransactionStatus, tvm.ExitCode, tlb.Coins, error)
	GetClient(ctx context.Context) (tracetracking.SignedAPIClient, error)
	InflightCount() (int, int)
}

var _ TxManager = (*Txm)(nil)

type Txm struct {
	logger   logger.Logger
	keystore core.Keystore
	config   Config
	chainID  string
	metrics  *txmMetrics

	clientProvider func(context.Context) (tracetracking.SignedAPIClient, error)
	traceFollow    tracetracking.FollowCondition // which outgoing messages the confirm loop waits for
	traceOutcome   tracetracking.StopCondition   // which trace branches decide a transaction's outcome
	// messageValidity is how long a built external message can be accepted by the wallet,
	// and messageClockSkew the tolerance applied to it (see broadcastLookupClockSkew).
	messageValidity  time.Duration
	messageClockSkew time.Duration
	broadcastChan    chan *Tx
	accountStore     *AccountStore
	starter          services.StateMachine
	done             sync.WaitGroup
	stop             services.StopChan
}

type Request struct {
	Mode            uint8           // Send mode for TON message
	FromWallet      wallet.Wallet   // Source wallet address
	ContractAddress address.Address // Destination contract or wallet address
	Body            *cell.Cell      // Encoded message body (method + params)
	Amount          tlb.Coins       // Amount in nanotons
	Bounce          bool            // Bounce on error (TON message flag)
	StateInit       *cell.Cell      // Optional: contract deploy init
	ID              *string         // Optional: unique ID for transaction tracking
}

func New(
	lggr logger.Logger,
	chainID string,
	keystore core.Keystore,
	clientProvider func(context.Context) (tracetracking.SignedAPIClient, error),
	config Config,
	opts ...Option,
) (*Txm, error) {
	if err := config.ValidateConfig(); err != nil {
		return nil, fmt.Errorf("invalid txm config: %w", err)
	}

	metrics, err := newMetrics(chainID)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize metrics: %w", err)
	}

	txm := &Txm{
		logger:           logger.Named(lggr, "Txm"),
		keystore:         keystore,
		config:           config,
		chainID:          chainID,
		metrics:          metrics,
		clientProvider:   clientProvider,
		traceFollow:      tracetracking.FollowAll,
		traceOutcome:     tracetracking.NoBound,
		messageValidity:  tonconfig.MessageValidity,
		messageClockSkew: broadcastLookupClockSkew,
		broadcastChan:    make(chan *Tx, config.BroadcastChanSize),
		accountStore:     NewAccountStore(),
		stop:             make(chan struct{}),
	}
	for _, opt := range opts {
		opt(txm)
	}

	return txm, nil
}

// Option configures optional Txm behaviour.
type Option func(*Txm)

// WithTraceBoundaries bounds the transaction traces the confirm loop resolves: follow selects the
// outgoing messages it waits for, and outcome stops the branches that don't count towards a
// transaction's success. By default the whole trace is waited for and evaluated.
func WithTraceBoundaries(follow tracetracking.FollowCondition, outcome tracetracking.StopCondition) Option {
	return func(t *Txm) {
		if follow != nil {
			t.traceFollow = follow
		}
		if outcome != nil {
			t.traceOutcome = outcome
		}
	}
}

func (t *Txm) Name() string {
	return t.logger.Name()
}

func (t *Txm) Ready() error {
	return t.starter.Ready()
}

func (t *Txm) HealthReport() map[string]error {
	return map[string]error{t.Name(): t.starter.Healthy()}
}

func (t *Txm) GetClient(ctx context.Context) (tracetracking.SignedAPIClient, error) {
	return t.clientProvider(ctx)
}

func (t *Txm) Start(ctx context.Context) error {
	return t.starter.StartOnce("Txm", func() error {
		t.done.Add(3) // wait group: broadcast loop, confirm loop, and cleanup loop
		go t.broadcastLoop()
		go t.confirmLoop()
		go t.cleanupLoop()
		return nil
	})
}

func (t *Txm) InflightCount() (int, int) {
	return len(t.broadcastChan), t.accountStore.GetTotalInflightCount()
}

func (t *Txm) Close() error {
	return t.starter.StopOnce("Txm", func() error {
		close(t.stop)
		t.done.Wait()
		return nil
	})
}

// Enqueues a transaction for broadcasting.
func (t *Txm) Enqueue(request Request) error {
	// Check if service is shutting down
	if err := t.starter.Ready(); err != nil {
		return fmt.Errorf("txm not ready: %w", err)
	}

	// NOTE: this will fail because the wallet is initialized with a signer and has no private key
	// we should be validating this in chain.go/API client, not per enqueue since it's wasted signatures
	// Ensure we can sign with the requested address
	// pubKey := request.FromWallet.PrivateKey().Public()
	// pubKeyHex, err := key.PublicKeyHex(pubKey)
	// if err != nil {
	// 	return fmt.Errorf("failed to convert public key to hex: %w", err)
	// }
	//
	// if _, err := t.keystore.Sign(context.Background(), pubKeyHex, nil); err != nil {
	// 	return fmt.Errorf("failed to sign: %w", err)
	// }

	ctx, cancel := context.WithTimeout(context.TODO(), time.Second*10)
	defer cancel()

	{
		client, err := t.clientProvider(context.TODO())
		if err != nil {
			return fmt.Errorf("failed to get client: %w", err)
		}
		block, err := client.Client.CurrentMasterchainInfo(ctx)
		if err != nil {
			return fmt.Errorf("RPC error: failed to get current masterchain info: %w", err)
		}
		transmitterAccount, err := client.Client.WaitForBlock(block.SeqNo).GetAccount(ctx, block, client.Wallet.WalletAddress())
		if err != nil {
			return fmt.Errorf("RPC error: failed to get transmitter account info: %w", err)
		}

		// If account is not active, balance is 0
		if !transmitterAccount.IsActive || transmitterAccount.State == nil {
			return fmt.Errorf("failed to get account status: account.IsActive: %v, account.State == nil: %v", transmitterAccount.IsActive, transmitterAccount.State == nil)
		}
		maxAmount, err := request.Amount.Add(*walletGas(request))
		if err != nil {
			return fmt.Errorf("failed to add wallet gas: %w", err)
		}

		if transmitterAccount.State.Balance.Nano().Cmp(maxAmount.Nano()) == -1 {
			return fmt.Errorf("insufficient balance for transmission: have %s, need %s", transmitterAccount.State.Balance, maxAmount)
		}
	}

	tx, err := newTx(request, time.Now(), t.config.TxExpiration.Duration())
	if err != nil {
		return err
	}

	// IfStarted holds the state read lock, so the submission cannot interleave with Close.
	var enqueueErr error
	started := t.starter.IfStarted(func() {
		select {
		case t.broadcastChan <- tx:
		default:
			enqueueErr = errors.New("broadcast channel full, could not enqueue transaction")
		}
	})
	if !started {
		return errors.New("txm stopped, could not enqueue transaction")
	}
	return enqueueErr
}

// Continuously listens and broadcasts enqueued transactions
func (t *Txm) broadcastLoop() {
	defer t.done.Done()

	ctx, cancel := commonutils.ContextFromChan(t.stop)
	defer cancel()

	t.logger.Debugw("broadcastLoop: started")

	for {
		select {
		case tx := <-t.broadcastChan:
			t.logger.Debugw("broadcasting transaction", "to", tx.To.String(), "amount", tx.Amount.Nano().String())

			msg, err := newWalletMessage(tx)
			if err != nil {
				t.logger.Errorw("failed to build wallet message", "err", err, "to", tx.To.String())
				continue
			}

			// 3. Sign and send
			txID := "none"
			if tx.ID != nil {
				txID = *tx.ID
			}
			bodyBOC := "none"
			if tx.Body != nil {
				bodyBOC = hex.EncodeToString(tx.Body.ToBOC())
			}
			t.logger.Debugw("attempting to broadcast transaction",
				"txID", txID,
				"from", tx.From.String(),
				"to", tx.To.String(),
				"amount", tx.Amount.Nano().String(),
				"mode", tx.Mode,
				"bodyBOC", bodyBOC,
				"bounceable", tx.Bounceable)
			err = t.broadcastWithRetry(ctx, tx, msg, txID)
			if err != nil {
				t.logger.Errorw("broadcast failed after retries",
					"txID", txID,
					"err", err,
					"to", tx.To.String(),
					"from", tx.From.String())
				continue
			}
		case <-t.stop:
			t.logger.Debugw("broadcastLoop: stopped")
			return
		}
	}
}

// newWalletMessage builds the wallet message for tx, attaching a StateInit only when tx has one.
func newWalletMessage(tx *Tx) (*wallet.Message, error) {
	var stateInit *tlb.StateInit
	if tx.StateInit != nil {
		stateInit = &tlb.StateInit{}
		if err := tlb.Parse(stateInit, tx.StateInit); err != nil {
			return nil, fmt.Errorf("failed to parse StateInit: %w", err)
		}
	}
	return &wallet.Message{
		Mode: tx.Mode,
		InternalMessage: &tlb.InternalMessage{
			// HighloadV3 rejects (exit 37) messages whose src is not addr_none; the network fills it in.
			SrcAddr:     address.NewAddressNone(),
			DstAddr:     &tx.To,
			Bounce:      tx.Bounceable,
			IHRDisabled: true,
			Amount:      tx.Amount,
			StateInit:   stateInit,
			Body:        tx.Body,
			CreatedAt:   uint32(tx.CreatedAt.Unix()), //nolint:gosec // G115: fits in a uint32, see Tx.CreatedAt
		},
	}, nil
}

// broadcastWithRetry Attempts to broadcast a transaction with retries on failure. We only retry if there was a
// failure to send the transaction, not if the transaction was broadcast but failed to execute (non-zero exit code).
// Retries use exponential backoff starting from SendRetryDelay, doubling the delay each attempt.
// Retries re-send the same signed external message, so the transaction is executed at most once.
func (t *Txm) broadcastWithRetry(ctx context.Context, tx *Tx, msg *wallet.Message, txID string) error {
	client, err := t.clientProvider(ctx)
	if err != nil {
		return fmt.Errorf("failed to get client: %w", err)
	}

	b := &broadcast{
		t:           t,
		client:      client,
		tx:          tx,
		msg:         msg,
		txID:        txID,
		lookupAfter: time.Now().Add(-t.messageClockSkew),
	}
	receivedMessage, err := b.run(ctx)
	if err != nil {
		return err
	}
	t.onBroadcastSucceeded(tx, receivedMessage, txID)

	// Record broadcast time and save to unconfirmed store.
	tx.BroadcastAt = time.Now()
	broadcastLatency := tx.BroadcastAt.Sub(tx.CreatedAt)
	t.metrics.RecordBroadcastLatency(ctx, broadcastLatency)
	t.logger.Debugw("transaction broadcast latency recorded",
		"txID", txID,
		"latency", broadcastLatency.String())

	// Save receivedMessage into tx
	tx.ReceivedMessage = *receivedMessage

	walletAddr := client.Wallet.Address().String()
	txStore := t.accountStore.GetTxStore(walletAddr)
	if txStore == nil {
		return fmt.Errorf("txStore not found for sender %s", walletAddr)
	}

	expirationTimestampMs := uint64(tx.Expiration.UnixMilli()) // exact, see Tx.Expiration
	err = txStore.AddUnconfirmed(receivedMessage.LamportTime, expirationTimestampMs, tx)
	if err != nil {
		return fmt.Errorf("failed to track broadcast transaction as unconfirmed: %w", err)
	}

	return nil
}

// onBroadcastSucceeded logs the outcome of the wallet transaction that processed a broadcast
// transaction.
func (t *Txm) onBroadcastSucceeded(tx *Tx, receivedMessage *tracetracking.ReceivedMessage, txID string) {
	t.logger.Infow("transaction broadcasted",
		"txID", txID,
		"to", tx.To.String(),
		"amount", tx.Amount.Nano().String())

	// Transaction was broadcast successfully, but may have failed to execute.
	// Use separate error variable since this doesn't affect broadcast success.
	result, exitCode, resultErr := receivedMessage.Result()
	if resultErr != nil {
		t.logger.Errorw("failed to get transaction outcome", "error", resultErr)
	} else if result != tracetracking.ResultSuccess {
		t.logger.Errorw("transaction failed", "phase", result, "exitcode", exitCode, "description", exitCode.Describe())
	}

	if len(receivedMessage.OutgoingInternalSentMessages) == 0 && len(receivedMessage.OutgoingInternalReceivedMessages) == 0 {
		t.logger.Errorw("transaction did not produce any outgoing messages, this may indicate that the value of the enqueued message was higher than the balance of the account",
			"txID", txID,
			"to", tx.To.String(),
			"amount", tx.Amount.Nano().String(),
		)
	}
}

// Periodically checks unconfirmed transactions for finality.
func (t *Txm) confirmLoop() {
	defer t.done.Done()

	pollDuration := t.config.ConfirmPollInterval.Duration()
	tick := time.After(pollDuration)

	t.logger.Debugw("confirmLoop: started")

	ctx, cancel := t.stop.NewCtx()
	defer cancel()

	for {
		select {
		case <-tick:
			start := time.Now()

			t.checkUnconfirmed(ctx)

			remaining := pollDuration - time.Since(start)
			if remaining > 0 {
				// reset tick for the remaining time
				tick = time.After(timeutil.JitterPct(0.1).Apply(remaining))
			} else {
				// reset tick to fire immediately
				tick = time.After(0)
			}
		case <-ctx.Done():
			t.logger.Debugw("confirmLoop: stopped")
			return
		}
	}
}

// Validates the confirmation status of all unconfirmed transactions by resolving their traces.
func (t *Txm) checkUnconfirmed(ctx context.Context) {
	allUnconfirmedTxs := t.accountStore.GetAllUnconfirmed()

	for accountAddress, unconfirmedTxs := range allUnconfirmedTxs {
		txStore := t.accountStore.GetTxStore(accountAddress)

		for _, unconfirmedTx := range unconfirmedTxs {
			tx := unconfirmedTx.Tx
			receivedMessage := tx.ReceivedMessage

			client, err := t.clientProvider(ctx)
			if err != nil {
				t.logger.Errorw("failed to get client", "error", err)
				continue
			}
			traceCtx, traceCancel := context.WithTimeout(ctx, t.config.TraceTimeout.Duration())
			traceErr := receivedMessage.WaitForTraceWith(traceCtx, client.Client, t.traceFollow)
			traceCancel()
			if traceErr != nil {
				if errors.Is(traceErr, context.DeadlineExceeded) {
					// We still store the mutated receivedMessage back even on timeout since as it
					// could have partial trace data. This updates the underlying copy in the txStore.
					tx.ReceivedMessage = receivedMessage
					t.logger.Warnw("trace gathering timed out, will retry next poll",
						"LT", unconfirmedTx.LT,
						"timeout", t.config.TraceTimeout.Duration(),
						"error", traceErr)
				} else {
					t.logger.Errorw("failed to wait for trace", "LT", unconfirmedTx.LT, "error", traceErr)
				}
				continue
			}

			// Update tx with potentially mutated receivedMessage containing newly found trace data.
			// This updates the underlying copy in the txStore.
			tx.ReceivedMessage = receivedMessage

			if *t.config.EnableTraceLogging {
				// zeroVersion := *semver.MustParse("0.0.0")
				knownAddresses := map[string]debug.TypeAndVersion{
					// senderAddress.String():             {Type: "SenderWallet", Version: zeroVersion},
				}
				t.logger.Debugf("Msg tree trace:\n%s\n", debug.NewDebuggerTreeTrace(knownAddresses).DumpReceived(&receivedMessage))
				t.logger.Debugf("Msg sequence diagram:\n%s\n", debug.NewDebuggerSequenceTrace(knownAddresses, sequenceDiagram.OutputFmtURL).DumpReceived(&receivedMessage))
			}

			if receivedMessage.TraceStatus() != tracetracking.TraceFinalized {
				continue
			}

			// Track finalization latency
			tx.FinalizedAt = time.Now()
			finalizationLatency := tx.FinalizedAt.Sub(tx.BroadcastAt)
			t.metrics.RecordFinalizationLatency(ctx, finalizationLatency)
			t.logger.Debugw("transaction finalization latency recorded",
				"LT", unconfirmedTx.LT,
				"latency", finalizationLatency.String())

			result, exitCode, err := receivedMessage.TraceResultWith(t.traceOutcome)
			if err != nil {
				t.logger.Errorw("failed to get trace outcome", "LT", unconfirmedTx.LT, "error", err)
				continue
			}
			traceSucceeded := result == tracetracking.ResultSuccess

			if err := txStore.MarkFinalized(unconfirmedTx.LT, traceSucceeded, exitCode); err != nil {
				t.logger.Errorw("failed to mark tx as finalized in TxStore", "LT", unconfirmedTx.LT, "error", err)
				continue
			}

			t.metrics.IncrementFinalizedTxs(ctx)
			if traceSucceeded {
				t.metrics.IncrementSuccessTxs(ctx)
				t.logger.Infow("transaction confirmed", "LT", unconfirmedTx.LT, "exitCode", exitCode)
			} else {
				t.metrics.IncrementRevertTxs(ctx, fmt.Sprintf("%d", exitCode))
				t.logger.Warnw("transaction failed", "LT", unconfirmedTx.LT, "phase", result, "exitCode", exitCode)
			}
		}
	}

	// Update pending transactions metric after processing
	allUnconfirmedTxsByAccounts := t.accountStore.GetAllUnconfirmed()
	totalPending := 0
	for _, unconfirmedTxs := range allUnconfirmedTxsByAccounts {
		totalPending += len(unconfirmedTxs)
	}
	t.metrics.SetPendingTxs(ctx, totalPending)
}

// Periodically cleans up finalized and expired transactions from the TxStore.
func (t *Txm) cleanupLoop() {
	defer t.done.Done()

	cleanupInterval := t.config.CleanupInterval.Duration()
	ticker := time.NewTicker(cleanupInterval)
	defer ticker.Stop()

	t.logger.Debugw("cleanupLoop: started", "interval", cleanupInterval)

	for {
		select {
		case <-ticker.C:
			now := time.Now()
			if err := validateUnixMillis(now); err != nil {
				t.logger.Errorw("cleanup skipped: invalid current time", "err", err)
				continue
			}
			currentTimeMs := uint64(now.UnixMilli()) // exact, validated above
			finalizedLTs, expiredLTs := t.accountStore.CleanupAll(currentTimeMs)

			if len(finalizedLTs) > 0 || len(expiredLTs) > 0 {
				t.logger.Infow("cleaned up transactions",
					"finalized", len(finalizedLTs),
					"finalizedLTs", finalizedLTs,
					"expired", len(expiredLTs),
					"expiredLTs", expiredLTs,
					"currentTimeMs", currentTimeMs)
			} else {
				t.logger.Debugw("cleanup completed, no transactions removed")
			}
		case <-t.stop:
			t.logger.Debugw("cleanupLoop: stopped")
			return
		}
	}
}

// GetTransactionStatus translates internal TON transaction state to chainlink common statuses.
func (t *Txm) GetTransactionStatus(ctx context.Context, lt uint64) (commontypes.TransactionStatus, tvm.ExitCode, tlb.Coins, error) {
	client, err := t.clientProvider(ctx)
	if err != nil {
		return commontypes.Unknown, 0, tlb.ZeroCoins, fmt.Errorf("failed to get client: %w", err)
	}
	walletAddr := client.Wallet.Address().String()
	txStore := t.accountStore.GetTxStore(walletAddr)
	if txStore == nil {
		return commontypes.Unknown, 0, tlb.ZeroCoins, fmt.Errorf("txStore not found for sender %s", walletAddr)
	}

	status, succeeded, exitCode, totalActionFees, found := txStore.GetTxState(lt)
	if !found {
		return commontypes.Unknown, 0, totalActionFees, fmt.Errorf("transaction with id %d not found", lt)
	}

	switch status {
	case tracetracking.NotFound:
		return commontypes.Unknown, 0, totalActionFees, fmt.Errorf("transaction not found in state map: %d", lt)
	case tracetracking.Cascading:
		return commontypes.Pending, 0, totalActionFees, nil
	case tracetracking.Received:
		return commontypes.Unconfirmed, 0, totalActionFees, nil
	case tracetracking.Finalized:
		if succeeded {
			return commontypes.Finalized, exitCode, totalActionFees, nil
		}
		return commontypes.Failed, exitCode, totalActionFees, nil
	default:
		return commontypes.Unknown, 0, totalActionFees, fmt.Errorf("unexpected transaction state for lt %d: %d", lt, status)
	}
}

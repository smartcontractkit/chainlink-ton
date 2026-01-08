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
	"github.com/smartcontractkit/chainlink-common/pkg/loop"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	commontypes "github.com/smartcontractkit/chainlink-common/pkg/types"
	commonutils "github.com/smartcontractkit/chainlink-common/pkg/utils"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug"
	sequenceDiagram "github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/visualizations/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

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
	keystore loop.Keystore
	config   Config
	chainID  string
	metrics  *txmMetrics

	clientProvider func(context.Context) (tracetracking.SignedAPIClient, error)
	broadcastChan  chan *Tx
	accountStore   *AccountStore
	starter        commonutils.StartStopOnce
	done           sync.WaitGroup
	stop           services.StopChan
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
	keystore loop.Keystore,
	clientProvider func(context.Context) (tracetracking.SignedAPIClient, error),
	config Config,
) (*Txm, error) {
	metrics, err := newMetrics(chainID)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize metrics: %w", err)
	}

	txm := &Txm{
		logger:         logger.Named(lggr, "Txm"),
		keystore:       keystore,
		config:         config,
		chainID:        chainID,
		metrics:        metrics,
		clientProvider: clientProvider,
		broadcastChan:  make(chan *Tx, config.BroadcastChanSize),
		accountStore:   NewAccountStore(),
		stop:           make(chan struct{}),
	}

	return txm, nil
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

	txExpiration := t.config.TxExpiration.Duration()
	tx := &Tx{
		Mode:       request.Mode,
		From:       *request.FromWallet.Address(),
		To:         request.ContractAddress,
		Amount:     request.Amount,
		Body:       request.Body,
		StateInit:  request.StateInit,
		Bounceable: request.Bounce,
		CreatedAt:  time.Now(),
		Expiration: time.Now().Add(txExpiration),
		ID:         request.ID,
	}

	select {
	case t.broadcastChan <- tx:
		return nil
	default:
		return errors.New("broadcast channel full, could not enqueue transaction")
	}
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

			var st tlb.StateInit
			if tx.StateInit != nil {
				err := tlb.LoadFromCell(&st, tx.StateInit.BeginParse())
				if err != nil {
					t.logger.Errorw("load from cell failed", "err", err, "to", tx.To.String())
					continue
				}
			}

			internalMsg := &tlb.InternalMessage{
				SrcAddr:     &tx.From,
				DstAddr:     &tx.To,
				Bounce:      tx.Bounceable,
				IHRDisabled: true,
				Amount:      tx.Amount,
				StateInit:   &st,
				Body:        tx.Body,
				CreatedAt:   uint32(tx.CreatedAt.Unix()), //nolint:gosec // ignoring G115 overflow conversion
			}

			msg := &wallet.Message{
				Mode:            tx.Mode,
				InternalMessage: internalMsg,
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
			err := t.broadcastWithRetry(ctx, tx, msg, txID)
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

// broadcastWithRetry Attempts to broadcast a transaction with retries on failure. We only retry if there was a
// failure to send the transaction, not if the transaction was broadcast but failed to execute (non-zero exit code).
func (t *Txm) broadcastWithRetry(ctx context.Context, tx *Tx, msg *wallet.Message, txID string) error {
	var receivedMessage *tracetracking.ReceivedMessage
	var err error

	// load client
	client, cerr := t.clientProvider(ctx)
	if cerr != nil {
		return fmt.Errorf("failed to get client: %w", cerr)
	}

	// try to broadcast transaction
	for attempt := uint(1); attempt <= t.config.MaxSendRetryAttempts; attempt++ {
		t.logger.Debugw("sending transaction to TON",
			"txID", txID,
			"attempt", attempt,
			"to", tx.To.String(),
			"amount", tx.Amount.Nano().String(),
			"bounce", msg.InternalMessage.Bounce,
			"hasBody", msg.InternalMessage.Body != nil)
		receivedMessage, _, err = client.SendWaitTransaction(ctx, tx.To, msg)
		if err == nil {
			t.logger.Infow("transaction broadcasted",
				"txID", txID,
				"to", tx.To.String(),
				"amount", tx.Amount.Nano().String())

			// Transaction was broadcast successfully, but ultimately failed to execute due to ExitCode.
			if receivedMessage.ExitCode != 0 {
				t.logger.Errorw("transaction failed", "exitcode", receivedMessage.ExitCode, "description", receivedMessage.ExitCode.Describe())
			}

			// Wait for and gather full trace regardless of exit code for debugging purposes
			err = receivedMessage.WaitForTrace(ctx, client.Client)
			if err != nil {
				t.logger.Errorw("failed to wait for trace", "error", err)
			}
			t.logger.Debugf("Msg tree trace :\n%s\n", debug.NewDebuggerTreeTrace(nil).DumpReceived(receivedMessage))
			t.logger.Debugf("Msg sequence diagram:\n%s\n", debug.NewDebuggerSequenceTrace(nil, sequenceDiagram.OutputFmtURL).DumpReceived(receivedMessage))
			break
		}

		// Transaction failed to broadcast. Log error as a warning for now and fall through to retry delay below.
		t.logger.Warnw("failed to broadcast tx, will retry",
			"txID", txID,
			"attempt", attempt,
			"to", tx.To.String(),
			"err", err)

		select {
		case <-time.After(t.config.SendRetryDelay.Duration()):
		case <-t.stop:
			t.logger.Debugw("broadcastWithRetry: stopped during retry delay")
			return errors.New("broadcast aborted")
		}
	}

	if err != nil {
		t.metrics.IncrementFailedToBroadcastTxs(ctx)
		t.logger.Errorw("failed to broadcast tx after retries",
			"txID", txID,
			"err", err,
			"to", tx.To.String())
		return err
	}

	// Record broadcast timestamp and latency
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

	expirationTimestampMs := uint64(tx.Expiration.UnixMilli()) //nolint:gosec // ignoring G115 overflow conversion
	err = txStore.AddUnconfirmed(receivedMessage.LamportTime, expirationTimestampMs, tx)
	if err != nil {
		t.logger.Errorf("AddUnconfirmed err: %v", err)
		return err
	}

	return nil
}

// Periodically checks unconfirmed transactions for finality.
func (t *Txm) confirmLoop() {
	defer t.done.Done()

	_, cancel := commonutils.ContextFromChan(t.stop)
	defer cancel()

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
				tick = time.After(commonutils.WithJitter(remaining))
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
			err = receivedMessage.WaitForTrace(ctx, client.Client)
			if err != nil {
				t.logger.Errorw("failed to wait for trace", "LT", unconfirmedTx.LT, "error", err)
				continue
			}

			// zeroVersion := *semver.MustParse("0.0.0")
			knownAddresses := map[string]debug.TypeAndVersion{
				// senderAddress.String():             {Type: "SenderWallet", Version: zeroVersion},
			}
			t.logger.Debugf("Msg tree trace:\n%s\n", debug.NewDebuggerTreeTrace(knownAddresses).DumpReceived(&receivedMessage))
			t.logger.Debugf("Msg sequence diagram:\n%s\n", debug.NewDebuggerSequenceTrace(knownAddresses, sequenceDiagram.OutputFmtURL).DumpReceived(&receivedMessage))

			if receivedMessage.Status() != tracetracking.Finalized {
				continue
			}

			// Track finalization latency
			tx.FinalizedAt = time.Now()
			finalizationLatency := tx.FinalizedAt.Sub(tx.BroadcastAt)
			t.metrics.RecordFinalizationLatency(ctx, finalizationLatency)
			t.logger.Debugw("transaction finalization latency recorded",
				"LT", unconfirmedTx.LT,
				"latency", finalizationLatency.String())

			exitCode := receivedMessage.OutcomeExitCode()
			traceSucceeded := receivedMessage.TraceSucceeded()

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
				t.logger.Warnw("transaction failed", "LT", unconfirmedTx.LT, "exitCode", exitCode)
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
			currentTimeMs := uint64(time.Now().UnixMilli()) //nolint:gosec // ignoring G115 overflow conversion
			finalized, expired := t.accountStore.CleanupAll(currentTimeMs)

			if finalized > 0 || expired > 0 {
				t.logger.Infow("cleaned up transactions",
					"finalized", finalized,
					"expired", expired,
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

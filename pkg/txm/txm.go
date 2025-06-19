package txm

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/loop"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/smartcontractkit/chainlink-common/pkg/utils"
	commonutils "github.com/smartcontractkit/chainlink-common/pkg/utils"
	"github.com/smartcontractkit/chainlink-ton/tonutils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type TxManager interface {
	services.Service

	Enqueue(request Request) error
	GetClient() tonutils.ApiClient
	InflightCount() (int, int)
}

var _ TxManager = (*Txm)(nil)

type Txm struct {
	Logger   logger.Logger
	Keystore loop.Keystore
	Config   Config

	Client        tonutils.ApiClient
	BroadcastChan chan *Tx
	AccountStore  *AccountStore
	Starter       utils.StartStopOnce
	Done          sync.WaitGroup
	Stop          chan struct{}
}

type Request struct {
	Mode            uint8           // Send mode for TON message
	FromWallet      wallet.Wallet   // Source wallet address
	ContractAddress address.Address // Destination contract or wallet address
	Body            *cell.Cell      // Encoded message body (method + params)
	Amount          tlb.Coins       // Amount in nanotons
	Bounce          bool            // Bounce on error (TON message flag)
	StateInit       *cell.Cell      // Optional: contract deploy init
	Simulate        bool            // Optional: simulate instead of sending
}

func New(lgr logger.Logger, keystore loop.Keystore, client tonutils.ApiClient, config Config) *Txm {
	txm := &Txm{
		Logger:        logger.Named(lgr, "Txm"),
		Keystore:      keystore,
		Config:        config,
		Client:        client,
		BroadcastChan: make(chan *Tx, config.BroadcastChanSize),
		AccountStore:  NewAccountStore(),
		Stop:          make(chan struct{}),
	}

	return txm
}

func (t *Txm) Name() string {
	return t.Logger.Name()
}

func (t *Txm) Ready() error {
	return t.Starter.Ready()
}

func (t *Txm) HealthReport() map[string]error {
	return map[string]error{t.Name(): t.Starter.Healthy()}
}

func (t *Txm) GetClient() tonutils.ApiClient {
	return t.Client
}

func (t *Txm) Start(ctx context.Context) error {
	return t.Starter.StartOnce("Txm", func() error {
		t.Done.Add(2) // waitgroup: broadcast loop and confirm loop
		go t.broadcastLoop()
		go t.confirmLoop()
		return nil
	})
}

func (t *Txm) InflightCount() (int, int) {
	return len(t.BroadcastChan), t.AccountStore.GetTotalInflightCount()
}

func (t *Txm) Close() error {
	return t.Starter.StopOnce("Txm", func() error {
		close(t.Stop)
		t.Done.Wait()
		return nil
	})
}

// Enqueues a transaction for broadcasting.
func (t *Txm) Enqueue(request Request) error {
	// Ensure we can sign with the requested address
	publicKey := fmt.Sprintf("%064x", request.FromWallet.PrivateKey().Public())
	if _, err := t.Keystore.Sign(context.Background(), publicKey, nil); err != nil {
		return fmt.Errorf("failed to sign: %w", err)
	}

	tx := &Tx{
		Mode:        request.Mode,
		From:        *request.FromWallet.Address(),
		To:          request.ContractAddress,
		Amount:      request.Amount,
		Body:        request.Body,
		StateInit:   request.StateInit,
		Bounceable:  request.Bounce,
		CreatedAt:   time.Now(),
		Expiration:  time.Now().Add(5 * time.Minute),
		EstimateGas: request.Simulate,
	}

	select {
	case t.BroadcastChan <- tx:
		return nil
	default:
		return fmt.Errorf("broadcast channel full, could not enqueue transaction")
	}
}

// Continuously listens and broadcasts enqueued transactions
func (t *Txm) broadcastLoop() {
	defer t.Done.Done()

	ctx, cancel := utils.ContextFromChan(t.Stop)
	defer cancel()

	t.Logger.Debugw("broadcastLoop: started")

	for {
		select {
		case tx := <-t.BroadcastChan:
			t.Logger.Debugw("broadcasting transaction", "to", tx.To.String(), "amount", tx.Amount.Nano().String())

			var st tlb.StateInit
			if tx.StateInit != nil {
				err := tlb.LoadFromCell(&st, tx.StateInit.BeginParse())
				if err != nil {
					t.Logger.Errorw("load from cell failed", "err", err, "to", tx.To.String())
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
				CreatedAt:   uint32(tx.CreatedAt.Unix()),
			}

			msg := &wallet.Message{
				Mode:            tx.Mode,
				InternalMessage: internalMsg,
			}

			// if tx.EstimateGas {
			// 	ok, gasUsed, err := t.SimulateTransaction(ctx, msg, tx.From)
			// 	if err != nil || !ok {
			// 		t.Logger.Errorw("simulation failed", "err", err, "to", tx.To.String())
			// 		continue
			// 	}
			// 	t.Logger.Infow("simulation succeeded", "to", tx.To.String(), "gasUsed", gasUsed)
			// }

			// 3. Sign and send
			err := t.broadcastWithRetry(ctx, tx, msg)
			if err != nil {
				t.Logger.Errorw("broadcast failed after retries", "err", err)
				continue
			}
		case <-t.Stop:
			t.Logger.Debugw("broadcastLoop: stopped")
			return
		}
	}
}

// Attempts to broadcast a transaction with retries on failure.
func (t *Txm) broadcastWithRetry(ctx context.Context, tx *Tx, msg *wallet.Message) error {
	var receivedMessage *tonutils.ReceivedMessage
	var err error

	for attempt := uint(1); attempt <= t.Config.MaxSendRetryAttempts; attempt++ {
		receivedMessage, _, err = t.Client.SendWaitTransaction(ctx, tx.To, msg)

		if err == nil {
			t.Logger.Infow("transaction broadcasted", "to", tx.To.String(), "amount", tx.Amount.Nano().String())
			break
		}

		t.Logger.Warnw("failed to broadcast tx, will retry", "attempt", attempt, "err", err, "to", tx.To.String())

		select {
		case <-time.After(t.Config.SendRetryDelay):
		case <-t.Stop:
			t.Logger.Debugw("broadcastWithRetry: stopped during retry delay")
			return fmt.Errorf("broadcast aborted")
		}
	}

	if err != nil {
		t.Logger.Errorw("failed to broadcast tx after retries", "err", err, "to", tx.To.String())
		return err
	}

	// Save receivedMessage into tx
	tx.ReceivedMessage = *receivedMessage

	// Determine expiration
	lamportTime := receivedMessage.LamportTime
	lamportTimeSecs := lamportTime / 1000
	expirationTimestampSecs := lamportTimeSecs + uint64(t.Config.SendRetryDelay.Seconds())

	txStore := t.AccountStore.GetTxStore(t.Client.Wallet.Address().String())
	if txStore == nil {
		return fmt.Errorf("txStore not found for sender %s", t.Client.Wallet.Address().String())
	}

	err = txStore.AddUnconfirmed(lamportTime, expirationTimestampSecs, tx)
	if err != nil {
		t.Logger.Errorf("AddUnconfirmed err: %v", err)
		return err
	}

	return nil
}

// Periodically checks unconfirmed transactions for finality.
func (t *Txm) confirmLoop() {
	defer t.Done.Done()

	_, cancel := commonutils.ContextFromChan(t.Stop)
	defer cancel()

	pollDuration := time.Duration(t.Config.ConfirmPollSecs) * time.Second
	tick := time.After(pollDuration)

	t.Logger.Debugw("confirmLoop: started")

	for {
		select {
		case <-tick:
			start := time.Now()

			t.checkUnconfirmed()

			remaining := pollDuration - time.Since(start)
			if remaining > 0 {
				// reset tick for the remaining time
				tick = time.After(commonutils.WithJitter(remaining))
			} else {
				// reset tick to fire immediately
				tick = time.After(0)
			}
		case <-t.Stop:
			t.Logger.Debugw("confirmLoop: stopped")
			return
		}
	}
}

// Validates the confirmation status of all unconfirmed transactions by resolving their traces.
func (t *Txm) checkUnconfirmed() {
	allUnconfirmedTxs := t.AccountStore.GetAllUnconfirmed()

	for accountAddress, unconfirmedTxs := range allUnconfirmedTxs {
		txStore := t.AccountStore.GetTxStore(accountAddress)

		for _, unconfirmedTx := range unconfirmedTxs {
			tx := unconfirmedTx.Tx
			receivedMessage := tx.ReceivedMessage

			err := tx.ReceivedMessage.WaitForTrace(&t.Client)
			if err != nil {
				t.Logger.Errorw("failed to wait for trace", "LT", unconfirmedTx.LT, "error", err)
				continue
			}

			msgStatus := receivedMessage.Status()

			if msgStatus != tonutils.Finalized {
				continue
			}

			exitCode := receivedMessage.OutcomeExitCode()
			traceSucceeded := receivedMessage.TraceSucceeded()

			if err := txStore.MarkFinalized(unconfirmedTx.LT, traceSucceeded, exitCode); err != nil {
				t.Logger.Errorw("failed to mark tx as finalized in TxStore", "LT", unconfirmedTx.LT, "error", err)
				continue
			}

			if traceSucceeded {
				t.Logger.Infow("transaction confirmed", "LT", unconfirmedTx.LT, "status", msgStatus, "exitCode", exitCode)
			} else {
				t.Logger.Warnw("transaction failed", "LT", unconfirmedTx.LT, "status", msgStatus, "exitCode", exitCode)
			}
		}
	}
}

package txm

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/loop"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	commontypes "github.com/smartcontractkit/chainlink-common/pkg/types"
	"github.com/smartcontractkit/chainlink-common/pkg/utils"
	commonutils "github.com/smartcontractkit/chainlink-common/pkg/utils"
	"github.com/smartcontractkit/chainlink-ton/tonutils"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var _ services.Service = &TONTxm{}

const (
	MAX_RETRY_ATTEMPTS           = 5
	MAX_BROADCAST_RETRY_DURATION = 30 * time.Second
	BROADCAST_DELAY_DURATION     = 2 * time.Second
)

type TONTxm struct {
	Logger   logger.Logger
	Keystore loop.Keystore
	Config   TONTxmConfig

	Client        tonutils.ApiClient
	BroadcastChan chan *TONTx
	AccountStore  *AccountStore
	Starter       utils.StartStopOnce
	Done          sync.WaitGroup
	Stop          chan struct{}
}

type TONTxmRequest struct {
	FromWallet      wallet.Wallet   // Source wallet address
	ContractAddress address.Address // Destination contract or wallet address
	Body            *cell.Cell      // Encoded message body (method + params)
	Amount          tlb.Coins       // Amount in nanotons
	Bounce          bool            // Bounce on error (TON message flag)
	StateInit       *cell.Cell      // Optional: contract deploy init
	Simulate        bool            // Optional: simulate instead of sending
}

func New(lgr logger.Logger, keystore loop.Keystore, client tonutils.ApiClient, config TONTxmConfig) *TONTxm {
	txm := &TONTxm{
		Logger:        logger.Named(lgr, "TONTxm"),
		Keystore:      keystore,
		Config:        config,
		Client:        client,
		BroadcastChan: make(chan *TONTx, config.BroadcastChanSize),
		AccountStore:  NewAccountStore(),
		Stop:          make(chan struct{}),
	}

	// Set defaults for missing config values
	txm.setDefaults()

	return txm
}

func (t *TONTxm) setDefaults() {

}

func (t *TONTxm) Name() string {
	return t.Logger.Name()
}

func (t *TONTxm) Ready() error {
	return t.Starter.Ready()
}

func (t *TONTxm) HealthReport() map[string]error {
	return map[string]error{t.Name(): t.Starter.Healthy()}
}

func (t *TONTxm) GetClient() tonutils.ApiClient {
	return t.Client
}

func (t *TONTxm) Start(ctx context.Context) error {
	return t.Starter.StartOnce("TONTxm", func() error {
		t.Done.Add(2) // waitgroup: broadcast loop and confirm loop
		go t.broadcastLoop()
		go t.confirmLoop()
		return nil
	})
}

func (t *TONTxm) InflightCount() (int, int) {
	return len(t.BroadcastChan), t.AccountStore.GetTotalInflightCount()
}

func (t *TONTxm) Close() error {
	return t.Starter.StopOnce("TONTxm", func() error {
		close(t.Stop)
		t.Done.Wait()
		return nil
	})
}

// Enqueues a transaction for broadcasting.
// Each item in the params array should be a map with a single key-value pair, where
// the key is the ABI type.
func (t *TONTxm) Enqueue(request TONTxmRequest) error {
	// Ensure we can sign with the requested address
	publicKey := fmt.Sprintf("%064x", request.FromWallet.PrivateKey().Public())
	if _, err := t.Keystore.Sign(context.Background(), publicKey, nil); err != nil {
		return fmt.Errorf("failed to sign: %w", err)
	}

	tx := &TONTx{
		From:            *request.FromWallet.Address(),
		To:              request.ContractAddress,
		Amount:          request.Amount,
		Body:            request.Body,
		StateInit:       request.StateInit,
		Bounceable:      request.Bounce,
		CreatedAt:       time.Now(),
		Expiration:      time.Now().Add(5 * time.Minute), // Optional TTL logic
		EstimateGas:     request.Simulate,
		Attempt:         0,
		OutOfTimeErrors: 0,
	}

	select {
	case t.BroadcastChan <- tx:
		return nil
	default:
		return fmt.Errorf("broadcast channel full, could not enqueue transaction")
	}
}

func (t *TONTxm) broadcastLoop() {
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
				Mode:            1, // Pay fees from amount,
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
			receivedMessage, _, err := t.Client.SendWaitTransaction(ctx, tx.To, msg)
			if err != nil {
				t.Logger.Errorw("failed to broadcast tx", "err", err, "to", tx.To.String())
				continue
			}

			t.Logger.Infow("transaction broadcasted", "to", tx.To.String(), "amount", tx.Amount.Nano().String())

			txStore := t.AccountStore.GetTxStore(t.Client.Wallet.Address().String())

			lamportTime := receivedMessage.LamportTime
			lamportTimeSecs := lamportTime / 1000
			expirationTimestampSecs := lamportTimeSecs + uint64(t.Config.SendRetryDelay.Seconds())

			if err != nil {
				t.Logger.Errorw("failed to MapToReceivedMessage", "tx", tx, "error", err)
			}
			tx.ReceivedMessage = *receivedMessage

			err = txStore.AddUnconfirmed(lamportTime, expirationTimestampSecs, tx)

			if err != nil {
				t.Logger.Errorf("AddUnconfirmed err: %w", err)
			}
		case <-t.Stop:
			t.Logger.Debugw("broadcastLoop: stopped")
			return
		}
	}
}

func (t *TONTxm) confirmLoop() {
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

func (t *TONTxm) checkUnconfirmed() {
	allUnconfirmedTxs := t.AccountStore.GetAllUnconfirmed()

	for accountAddress, unconfirmedTxs := range allUnconfirmedTxs {
		txStore := t.AccountStore.GetTxStore(accountAddress)

		for _, unconfirmedTx := range unconfirmedTxs {
			msgStatus := unconfirmedTx.Tx.ReceivedMessage.Status()
			err := unconfirmedTx.Tx.ReceivedMessage.WaitForTrace(&t.Client)
			if err != nil {
				t.Logger.Errorw("failed to wait for outgoing messages to be received", "LT", unconfirmedTx.LT, "error", err)
				continue
			}

			if err := txStore.Confirm(unconfirmedTx.LT); err != nil {
				t.Logger.Errorw("failed to confirm tx in TxStore", "LT", unconfirmedTx.LT, "error", err)
			}
			unconfirmedTx.Tx.Status = commontypes.Finalized
			msgStatus = unconfirmedTx.Tx.ReceivedMessage.Status()
			t.Logger.Infow("transaction confirmed", "LT", unconfirmedTx.LT, "status", msgStatus)
			break
		}
	}
}

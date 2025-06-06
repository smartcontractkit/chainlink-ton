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
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var _ services.Service = &TONTxm{}

const (
	MAX_RETRY_ATTEMPTS           = 5
	MAX_BROADCAST_RETRY_DURATION = 30 * time.Second
	BROADCAST_DELAY_DURATION     = 2 * time.Second
	DEFAULT_ENERGY_MULTIPLIER    = 1.5
)

type TONTxm struct {
	Logger   logger.Logger
	Keystore loop.Keystore
	Config   TONTxmConfig

	Client        ton.APIClientWrapped
	Wallet        *wallet.Wallet
	BroadcastChan chan *TONTx
	AccountStore  *AccountStore
	Starter       utils.StartStopOnce
	Done          sync.WaitGroup
	Stop          chan struct{}
}

type TONTxmRequest struct {
	FromAddress     address.Address // Source wallet address
	ContractAddress address.Address // Destination contract or wallet address
	Body            *cell.Cell      // Encoded message body (method + params)
	Amount          tlb.Coins       // Amount in nanotons
	Bounce          bool            // Bounce on error (TON message flag)
	StateInit       *cell.Cell      // Optional: contract deploy init
	Simulate        bool            // Optional: simulate instead of sending
}

func New(lgr logger.Logger, keystore loop.Keystore, client ton.APIClientWrapped, wallet *wallet.Wallet, config TONTxmConfig) *TONTxm {
	txm := &TONTxm{
		Logger:        logger.Named(lgr, "TONTxm"),
		Keystore:      keystore,
		Config:        config,
		Client:        client,
		Wallet:        wallet,
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

func (t *TONTxm) GetClient() ton.APIClientWrapped {
	return t.Client
}

func (t *TONTxm) Start(ctx context.Context) error {
	return t.Starter.StartOnce("TONTxm", func() error {
		t.Done.Add(2) // waitgroup: broadcast loop and confirm loop
		go t.broadcastLoop()
		// go t.confirmLoop()
		return nil
	})
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
	if _, err := t.Keystore.Sign(context.Background(), request.FromAddress.String(), nil); err != nil {
		return fmt.Errorf("failed to sign: %w", err)
	}

	tx := &TONTx{
		From:            request.FromAddress,
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
		MsgHash:         "",
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

			// 1. Estimate gas (optional)
			// if tx.EstimateGas {
			// 	ok, err := t.SimulateTransaction(ctx, tx)
			// 	if err != nil || !ok {
			// 		t.Logger.Errorw("simulation failed", "err", err, "to", tx.To.String())
			// 		continue
			// 	}
			// }

			var st tlb.StateInit
			if tx.StateInit != nil {
				err := tlb.LoadFromCell(&st, tx.StateInit.BeginParse())
				if err != nil {
					t.Logger.Errorw("load from cell failed", "err", err, "to", tx.To.String())
					continue
				}
			}

			internalMsg := &tlb.InternalMessage{
				DstAddr:     &tx.To,
				Bounce:      tx.Bounceable,
				IHRDisabled: true,
				Amount:      tx.Amount,
				StateInit:   &st,
				Body:        tx.Body,
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
			if err := t.Wallet.Send(ctx, msg); err != nil {
				t.Logger.Errorw("failed to broadcast tx", "err", err, "to", tx.To.String())
				continue
			}

			t.Logger.Infow("transaction broadcasted", "to", tx.To.String(), "amount", tx.Amount.Nano().String())

		case <-t.Stop:
			t.Logger.Debugw("broadcastLoop: stopped")
			return
		}
	}
}

// func (t *TONTxm) SimulateTransaction(ctx context.Context, msg *wallet.Message, from address.Address) (bool, uint64, error) {
// 	extMsgCell, err := wallet.EncodeExternalMessage(msg, &from)
// 	if err != nil {
// 		return false, 0, fmt.Errorf("failed to encode external message: %w", err)
// 	}

// 	res, err := t.Client.RunExecutor(ctx, *msg.InternalMessage.DstAddr, extMsgCell, nil)
// 	if err != nil {
// 		return false, 0, fmt.Errorf("simulation failed: %w", err)
// 	}

// 	if !res.Success {
// 		return false, 0, fmt.Errorf("simulation failed with exit code %d", res.ExitCode)
// 	}

// 	return true, res.TotalFees, nil
// }

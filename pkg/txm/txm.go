package txm

import (
	"context"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/loop"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	commontypes "github.com/smartcontractkit/chainlink-common/pkg/types"
	"github.com/smartcontractkit/chainlink-common/pkg/utils"
	commonutils "github.com/smartcontractkit/chainlink-common/pkg/utils"
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
	LIST_TRANSACTIONS_BATCH_SIZE = uint32(20)
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
	FromWallet      wallet.Wallet   // Source wallet address
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
			tlbTx, block, err := t.Wallet.SendWaitTransaction(ctx, msg)
			if err != nil {
				t.Logger.Errorw("failed to broadcast tx", "err", err, "to", tx.To.String())
				continue
			}

			t.Logger.Infow("transaction broadcasted", "to", tx.To.String(), "amount", tx.Amount.Nano().String())

			txStore := t.AccountStore.GetTxStore(t.Wallet.Address().String())

			blockData, err := t.Client.GetBlockData(ctx, block)
			if err != nil {
				t.Logger.Errorf("GetBlockData err: %w", err)
			}

			expirationTimestampSecs := blockData.BlockInfo.EndLt + uint64(t.Config.SendRetryDelay.Seconds())
			txHash := hex.EncodeToString(tlbTx.Hash)
			tx.MsgHash = hex.EncodeToString(internalMsg.Payload().Hash())
			tx.LT = tlbTx.LT
			err = txStore.AddUnconfirmed(txHash, expirationTimestampSecs, tx)

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

	ctx, cancel := commonutils.ContextFromChan(t.Stop)
	defer cancel()

	pollDuration := time.Duration(t.Config.ConfirmPollSecs) * time.Second
	tick := time.After(pollDuration)

	t.Logger.Debugw("confirmLoop: started")

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
		case <-t.Stop:
			t.Logger.Debugw("confirmLoop: stopped")
			return
		}
	}
}

func (t *TONTxm) checkUnconfirmed(ctx context.Context) {
	allUnconfirmedTxs := t.AccountStore.GetAllUnconfirmed()

	block, err := t.Client.CurrentMasterchainInfo(ctx)
	if err != nil {
		t.Logger.Errorw("failed to get current masterchain block", "error", err)
		return
	}

	for accountAddress, unconfirmedTxs := range allUnconfirmedTxs {
		txStore := t.AccountStore.GetTxStore(accountAddress)

		// Get the source account (sender)
		sourceAddr, _ := address.ParseAddr(accountAddress)
		sourceAccount, err := t.Client.GetAccount(ctx, block, sourceAddr)
		if err != nil {
			t.Logger.Errorw("failed to get source account", "address", accountAddress, "error", err)
			continue
		}

		// Get transactions from source address
		txs, err := t.Client.ListTransactions(ctx, sourceAddr, LIST_TRANSACTIONS_BATCH_SIZE, sourceAccount.LastTxLT, sourceAccount.LastTxHash)
		if err != nil {
			t.Logger.Errorw("failed to list transactions", "address", accountAddress, "error", err)
			continue
		}

		for _, unconfirmedTx := range unconfirmedTxs {
			for _, tx := range txs {
				txHash := hex.EncodeToString(tx.Hash)

				if txHash == unconfirmedTx.Hash {
					// Transaction found on-chain - mark as confirmed
					// The fact that it exists means it was processed successfully
					if err := txStore.Confirm(unconfirmedTx.Hash); err != nil {
						t.Logger.Errorw("failed to confirm tx in TxStore", "hash", unconfirmedTx.Hash, "error", err)
					}
					unconfirmedTx.Tx.Status = commontypes.Finalized
					t.Logger.Infow("transaction confirmed", "hash", unconfirmedTx.Hash, "to", unconfirmedTx.Tx.To.String())
					break
				}
			}
		}
	}
}

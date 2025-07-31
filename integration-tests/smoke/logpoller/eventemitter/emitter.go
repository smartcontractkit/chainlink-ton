package eventemitter

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

type TestEventRes struct {
	Tx       *tlb.Transaction
	Block    *ton.BlockIDExt
	BatchIdx int
	TxIdx    int
}

type TestEventSource struct {
	name            string           // name of the event emitter
	contractAddress *address.Address // address of the event emitter contract
	id              uint32
	sentCounter     uint32
	targetCounter   *big.Int

	client ton.APIClientWrapped // msg sender client
	wallet *wallet.Wallet
	lggr   logger.Logger

	mu      sync.RWMutex
	running bool
	done    chan struct{}
}

func NewTestEventSource(ctx context.Context, client ton.APIClientWrapped, wallet *wallet.Wallet, name string, id uint32, lggr logger.Logger) (*TestEventSource, error) {
	addr, err := DeployCounterContract(client, wallet, id)
	if err != nil {
		return nil, err
	}

	// verify the contract deployment
	b, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, err
	}

	resIDRaw, err := GetID(ctx, client, b, addr)
	if err != nil {
		return nil, err
	}
	resID := uint32(resIDRaw.Uint64()) //nolint:gosec

	if id != resID {
		return nil, fmt.Errorf("unexpected ID for %s: expected %d, got %d", name, id, resID)
	}

	initialCounter, err := GetValue(ctx, client, b, addr)
	if err != nil {
		return nil, err
	}
	if initialCounter.Cmp(big.NewInt(0)) != 0 {
		return nil, fmt.Errorf("expected initial counter to be 0, got %s", initialCounter.String())
	}

	return &TestEventSource{
		name:            name,
		client:          client,
		contractAddress: addr,
		id:              id,
		wallet:          wallet,
		lggr:            lggr,
		running:         false,
	}, nil
}

func (e *TestEventSource) Name() string {
	return e.name
}

func (e *TestEventSource) ContractAddress() *address.Address {
	return e.contractAddress
}

func (e *TestEventSource) GetID() uint32 {
	return e.id
}

func (e *TestEventSource) Start(ctx context.Context, interval time.Duration, targetCounter *big.Int) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.running {
		return errors.New("event emitter is already running")
	}

	e.targetCounter = targetCounter
	e.done = make(chan struct{})
	e.running = true

	go e.eventLoop(ctx, interval)
	return nil
}

func (e *TestEventSource) Stop() {
	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.running {
		return
	}

	<-e.done
	e.running = false
}

func (e *TestEventSource) IsRunning() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.running
}

func (e *TestEventSource) eventLoop(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	target := uint32(e.targetCounter.Uint64()) //nolint:gosec // target is controlled by the test

	for {
		select {
		case <-ctx.Done():
			e.lggr.Debugf("Context cancelled for %s", e.name)
			close(e.done)
			return
		case <-ticker.C:
			e.mu.RLock()
			sent := e.sentCounter
			e.mu.RUnlock()

			if sent >= target {
				e.lggr.Debugf("Target count of %d reached for %s, stopping.", target, e.name)
				close(e.done)
				return
			}

			// Send message outside the lock
			if _, _, err := e.SendIncreaseCounterMsg(ctx); err != nil {
				e.lggr.Debugf("ERROR sending message from %s: %v", e.name, err)
			} else {
				// Only lock when updating the counter
				e.mu.Lock()
				e.sentCounter++
				e.mu.Unlock()
			}
		}
	}
}

func (e *TestEventSource) SendBulkTestEvents(ctx context.Context, batchCount, txPerBatch, msgPerTx int) ([]TestEventRes, error) {
	var txs []TestEventRes
	e.lggr.Debugf("=== Starting to send %d batches of %d transactions with %d messages each ===",
		batchCount, txPerBatch, msgPerTx)

	// Send transactions in batches with block waits
	for batchIdx := 0; batchIdx < batchCount; batchIdx++ {
		// Send multiple transactions in this batch
		for txIdx := 0; txIdx < txPerBatch; txIdx++ {
			// Send transaction with multiple messages
			e.lggr.Debugf("╭ Sending multiple increase counter messages from %s", e.name)
			tx, block, err := e.sendManyIncreaseCountMsgs(ctx, msgPerTx)
			if err != nil {
				return nil, fmt.Errorf("failed to send tx %d in batch %d: %w", txIdx, batchIdx, err)
			}

			txResult := TestEventRes{
				Tx:       tx,
				Block:    block,
				BatchIdx: batchIdx,
				TxIdx:    txIdx,
			}
			txs = append(txs, txResult)

			e.lggr.Debugf("╰ Sent: Batch=%d, Tx=%d, Messages=%d, LT=%d, Hash=%s, BlockSeq=%d",
				batchIdx, txIdx, msgPerTx, tx.LT, hex.EncodeToString(tx.Hash), block.SeqNo)
		}

		// delay between batches to try to get different blocks
		if batchIdx < batchCount-1 {
			currentBlockSeq := txs[len(txs)-1].Block.SeqNo

			// wait for current block to be confirmed
			_, err := e.client.WaitForBlock(currentBlockSeq).GetAccount(ctx, txs[len(txs)-1].Block, e.ContractAddress())
			if err != nil {
				return nil, fmt.Errorf("failed to wait for block %d confirmation: %w", currentBlockSeq, err)
			}
		}
	}
	return txs, nil
}

func (e *TestEventSource) SendIncreaseCounterMsg(ctx context.Context) (*tlb.Transaction, *ton.BlockIDExt, error) {
	e.lggr.Debugf("Sending increase counter message from %s", e.name)
	msg := &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     e.contractAddress,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        IncreaseCountMsgBody(),
		},
	}

	tx, block, err := e.wallet.SendWaitTransaction(ctx, msg)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to send message: %w", err)
	}

	return tx, block, nil
}

func (e *TestEventSource) sendManyIncreaseCountMsgs(ctx context.Context, count int) (*tlb.Transaction, *ton.BlockIDExt, error) {
	messages := make([]*wallet.Message, count)
	for i := 0; i < count; i++ {
		msg := &wallet.Message{
			Mode: 1,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      true,
				DstAddr:     e.contractAddress,
				Amount:      tlb.MustFromTON("0.1"),
				Body:        IncreaseCountMsgBody(),
			},
		}
		messages[i] = msg
	}
	tx, block, err := e.wallet.SendManyWaitTransaction(ctx, messages)
	if err != nil {
		e.lggr.Debugf("Failed to send multiple messages: %v", err)
		return nil, nil, err
	}

	return tx, block, nil
}

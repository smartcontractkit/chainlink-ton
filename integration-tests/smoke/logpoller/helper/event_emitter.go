package helper

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"math/rand/v2"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"integration-tests/smoke/logpoller/counter"
	test_utils "integration-tests/utils"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

func SendBulkTestEventTxs(t *testing.T, client ton.APIClientWrapped, batchCount, txPerBatch, msgPerTx int) (*TestEventSource, []TestEventRes) {
	// event sending wallet
	sender := test_utils.CreateRandomHighloadWallet(t, client)
	test_utils.FundWallets(t, client, []*address.Address{sender.Address()}, []tlb.Coins{tlb.MustFromTON("1000")})
	require.NotNil(t, sender)
	// deploy event emitter counter contract
	emitter, err := NewTestEventSource(t.Context(), client, sender, "emitter", rand.Uint32(), logger.Test(t))
	require.NoError(t, err)
	// bulk send events
	txs, err := emitter.SendBulkTestEvents(t.Context(), batchCount, txPerBatch, msgPerTx)
	require.NoError(t, err)

	expectedCounter := uint32(batchCount * txPerBatch * msgPerTx) //nolint:gosec // test code

	require.Eventually(t, func() bool {
		mb, err := client.CurrentMasterchainInfo(t.Context())
		if err != nil {
			return false
		}
		currentCounterRaw, err := emitter.GetCounterValue(t.Context(), mb)
		if err != nil {
			return false
		}
		currentCounter := uint32(currentCounterRaw.Uint64()) //nolint:gosec // test code
		return currentCounter == expectedCounter
	}, 30*time.Second, 2*time.Second, "Counter did not reach expected value within timeout")

	t.Logf("On-chain counter reached expected value of %d.", expectedCounter)

	time.Sleep(20 * time.Second)
	return emitter, txs
}

func VerifyLoadedEvents(msgs []*tlb.ExternalMessageOut, expectedCount int) error {
	seen := make(map[uint32]bool, expectedCount)

	// parse all events and track counters
	for i, ext := range msgs {
		event, err := test_utils.ParseEventFromMsg[counter.CountIncreasedEvent](ext)
		if err != nil {
			return fmt.Errorf("failed to parse event #%d: %w", i, err)
		}

		// check for duplicates
		if seen[event.Value] {
			return fmt.Errorf("duplicate counter %d found at index %d", event.Value, i)
		}
		seen[event.Value] = true
	}
	// verify all expected counters are present (1 to expectedCount)
	var missing []int
	for i := 1; i <= expectedCount; i++ {
		if !seen[uint32(i)] { //nolint:gosec // test code
			missing = append(missing, i)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("not all expected counters found, missing some from 1 to %v", missing)
	}

	return nil
}

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
	codeCell, cerr := wrappers.ParseCompiledContract(counter.ArtifactPath)
	if cerr != nil {
		return nil, fmt.Errorf("failed to parse compiled contract: %w", cerr)
	}

	// TODO: any context is not being used in contract helpers
	sigClient := &tracetracking.SignedAPIClient{
		Client: client,
		Wallet: *wallet,
	}

	data, err := tlb.ToCell(counter.Storage{
		ID:    id,
		Value: 0, // initial value as zero
	})

	if err != nil {
		return nil, fmt.Errorf("failed to create initial data cell: %w", err)
	}

	contract, err := wrappers.Deploy(
		sigClient,
		codeCell,
		data,
		tlb.MustFromTON("0.1"),
	)

	if err != nil {
		return nil, fmt.Errorf("failed to deploy contract: %w", err)
	}

	return &TestEventSource{
		name:            name,
		client:          client,
		contractAddress: contract.Address,
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
	body, err := tlb.ToCell(counter.IncreaseCountMsg{
		OpCode:  counter.IncreaseCounterOpCode,
		QueryID: rand.Uint64(),
	})

	if err != nil {
		return nil, nil, fmt.Errorf("failed to create cell: %w", err)
	}

	msg := &wallet.Message{
		Mode: 1,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     e.contractAddress,
			Amount:      tlb.MustFromTON("0.1"),
			Body:        body,
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
		body, err := tlb.ToCell(counter.IncreaseCountMsg{
			OpCode:  counter.IncreaseCounterOpCode,
			QueryID: rand.Uint64(),
		})
		if err != nil {
			return nil, nil, fmt.Errorf("failed to create cell: %w", err)
		}

		msg := &wallet.Message{
			Mode: 1,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      true,
				DstAddr:     e.contractAddress,
				Amount:      tlb.MustFromTON("0.1"),
				Body:        body,
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

func (e *TestEventSource) GetCounterID(ctx context.Context, block *ton.BlockIDExt) (*big.Int, error) {
	res, err := e.client.RunGetMethod(ctx, block, e.ContractAddress(), "id")
	if err != nil {
		return nil, fmt.Errorf("failed to run get method 'id': %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to extract id value: %w", err)
	}

	return val, nil
}

func (e *TestEventSource) GetCounterValue(ctx context.Context, block *ton.BlockIDExt) (*big.Int, error) {
	res, err := e.client.RunGetMethod(ctx, block, e.ContractAddress(), "value")
	if err != nil {
		return nil, fmt.Errorf("failed to run get method 'value': %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to extract value value: %w", err)
	}

	return val, nil
}

package eventemitter

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

// TODO: better name
type Input struct {
	TotalBatches int
	TxPerBatch   int
	MsgPerTx     int
}

// todo: no need for custom type
type TxResult struct {
	Tx       *tlb.Transaction
	Block    *ton.BlockIDExt
	BatchNum int
	TxNum    int
	MsgCount int
}

type EventEmitter struct {
	name            string           // name of the event emitter
	contractAddress *address.Address // address of the event emitter contract
	id              uint64
	lastCounter     uint64

	// Test helper fields
	client  ton.APIClientWrapped // msg sender client
	wallet  *wallet.Wallet
	ctx     context.Context
	t       *testing.T
	cancel  context.CancelFunc
	ticker  *time.Ticker
	mu      sync.RWMutex
	running bool
}

func NewEventEmitter(t *testing.T, client ton.APIClientWrapped, name string, selector uint64, wallet *wallet.Wallet) (*EventEmitter, error) {
	ctx := t.Context()
	addr, err := DeployEventEmitterContract(ctx, client, wallet, selector)
	if err != nil {
		return nil, err
	}

	// verify the contract deployment
	b, err := client.CurrentMasterchainInfo(ctx)
	require.NoError(t, err)

	resSelector, err := GetID(ctx, client, b, addr)
	require.NoError(t, err)
	require.Equal(t, selector, resSelector.Uint64(), "unexpected destination chain selector for "+name)

	initialCounter, err := GetCounter(ctx, client, b, addr)
	require.NoError(t, err)
	require.Equal(t, initialCounter.Cmp(big.NewInt(0)), 0)

	return &EventEmitter{
		t:               t,
		ctx:             ctx,
		name:            name,
		client:          client,
		contractAddress: addr,
		id:              selector,
		wallet:          wallet,
		lastCounter:     0,
		running:         false,
	}, nil
}

func (e *EventEmitter) StartEventEmitter(ctx context.Context, interval time.Duration) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.running {
		return fmt.Errorf("event emitter is already running")
	}

	e.ctx, e.cancel = context.WithCancel(ctx)
	e.ticker = time.NewTicker(interval)
	e.running = true

	go e.eventLoop()

	return nil
}

func (e *EventEmitter) StopEventEmitter() {
	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.running {
		return
	}

	e.cancel()
	e.ticker.Stop()
	e.running = false
}

func (e *EventEmitter) SendIncreaseCounterMsg() (*tlb.Transaction, *ton.BlockIDExt, error) {
	e.t.Logf("Sending increase counter message from %s", e.name)
	msg := IncreaseCounterMsg(e.contractAddress)

	tx, block, err := e.wallet.SendWaitTransaction(e.ctx, msg)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to send message: %w", err)
	}
	// Update counter after successful send
	e.mu.Lock()
	e.lastCounter++
	e.mu.Unlock()

	return tx, block, nil
}
func (e *EventEmitter) SendMultipleIncreaseCounterMsg(count int) (*tlb.Transaction, *ton.BlockIDExt, error) {
	e.t.Logf("Sending multiple increase counter messages from %s", e.name)

	messages := make([]*wallet.Message, count)
	for i := 0; i < count; i++ {
		msg := IncreaseCounterMsg(e.contractAddress)
		messages[i] = msg
	}
	tx, block, err := e.wallet.SendManyWaitTransaction(e.ctx, messages)
	if err != nil {
		e.t.Logf("Failed to send multiple messages: %v", err)
		return nil, nil, err
	}

	// Update counter after successful send
	e.mu.Lock()
	e.lastCounter += uint64(count)
	e.mu.Unlock()

	return tx, block, nil
}

// TODO: better name
func (e *EventEmitter) CreateEvents(input Input) []TxResult {
	var allTxResults []TxResult
	// TODO: just use lggr
	e.t.Logf("=== Starting to send %d batches of %d transactions with %d messages each ===",
		input.TotalBatches, input.TxPerBatch, input.MsgPerTx)

	// Send transactions in batches with block waits
	for batchNum := 0; batchNum < input.TotalBatches; batchNum++ {

		// Send multiple transactions in this batch
		for txNum := 0; txNum < input.TxPerBatch; txNum++ {

			// Send transaction with multiple messages
			tx, block, err := e.SendMultipleIncreaseCounterMsg(input.MsgPerTx)
			require.NoError(e.t, err, "failed to send tx %d in batch %d", txNum, batchNum)

			txResult := TxResult{
				Tx:       tx,
				Block:    block,
				BatchNum: batchNum,
				TxNum:    txNum,
				MsgCount: input.MsgPerTx,
			}
			allTxResults = append(allTxResults, txResult)

			e.t.Logf("Sent: Batch=%d, Tx=%d, Messages=%d, LT=%d, Hash=%s, BlockSeq=%d",
				batchNum, txNum, input.MsgPerTx, tx.LT, hex.EncodeToString(tx.Hash), block.SeqNo)
		}

		// Simple delay between batches to try to get different blocks
		if batchNum < input.TotalBatches-1 {
			currentBlockSeq := allTxResults[len(allTxResults)-1].Block.SeqNo
			e.t.Logf("Waiting for block %d confirmation...", currentBlockSeq)

			// Wait for current block to be confirmed
			_, err := e.client.WaitForBlock(currentBlockSeq).GetAccount(e.ctx,
				allTxResults[len(allTxResults)-1].Block, e.ContractAddress())
			require.NoError(e.t, err)
			e.t.Logf("Block %d confirmed", currentBlockSeq)
		}
	}

	e.t.Logf("=== All transactions sent ===")
	e.t.Logf("Total transactions: %d (each with %d messages)", len(allTxResults), input.MsgPerTx)

	// Analyze block distribution
	blockCounts := make(map[uint32]int)
	blockTxs := make(map[uint32][]TxResult)

	for _, txResult := range allTxResults {
		blockSeq := txResult.Block.SeqNo
		blockCounts[blockSeq]++
		blockTxs[blockSeq] = append(blockTxs[blockSeq], txResult)
	}

	e.t.Logf("=== Block Distribution Analysis ===")
	e.t.Logf("Transactions distributed across %d unique blocks:", len(blockCounts))

	for blockSeq, count := range blockCounts {
		e.t.Logf("Block %d: %d transactions", blockSeq, count)
		for _, txResult := range blockTxs[blockSeq] {
			e.t.Logf("  - Batch %d, Tx %d (%d msgs): LT=%d, Hash=%s",
				txResult.BatchNum, txResult.TxNum, txResult.MsgCount, txResult.Tx.LT,
				hex.EncodeToString(txResult.Tx.Hash)[:16]+"...")
		}
	}

	require.Greater(e.t, len(blockCounts), 1, "Expected transactions to be spread across multiple blocks")
	blockTxMap := make(map[uint32][]struct {
		TxIndex  int
		Batch    int
		TxNum    int
		Messages int
		LT       uint64
		Hash     string
	})

	// Group transactions by block
	for i, txResult := range allTxResults {
		blockSeqNo := txResult.Block.SeqNo
		blockTxMap[blockSeqNo] = append(blockTxMap[blockSeqNo], struct {
			TxIndex  int
			Batch    int
			TxNum    int
			Messages int
			LT       uint64
			Hash     string
		}{
			TxIndex:  i,
			Batch:    txResult.BatchNum,
			TxNum:    txResult.TxNum,
			Messages: txResult.MsgCount,
			LT:       txResult.Tx.LT,
			Hash:     hex.EncodeToString(txResult.Tx.Hash),
		})
	}

	// Get sorted block sequence numbers
	var blockSeqNos []uint32
	for seqNo := range blockTxMap {
		blockSeqNos = append(blockSeqNos, seqNo)
	}
	sort.Slice(blockSeqNos, func(i, j int) bool { return blockSeqNos[i] < blockSeqNos[j] })

	// Output the table
	e.t.Logf("=== Transactions by Block SeqNo ===")
	e.t.Logf("%-10s %-8s %-6s %-6s %-10s %-15s %-20s", "Block", "TxIndex", "Batch", "TxNum", "Messages", "LT", "Hash (first 16)")
	e.t.Logf("%-10s %-8s %-6s %-6s %-10s %-15s %-20s", "------", "-------", "-----", "-----", "--------", "--", "---------------")

	for _, seqNo := range blockSeqNos {
		txs := blockTxMap[seqNo]
		for _, tx := range txs {
			e.t.Logf("%-10d %-8d %-6d %-6d %-10d %-15d %-20s",
				seqNo, tx.TxIndex, tx.Batch, tx.TxNum, tx.Messages, tx.LT, tx.Hash[:16]+"...")
		}
	}

	// Output summary statistics
	e.t.Logf("\n=== Block Distribution Summary ===")
	e.t.Logf("Total Blocks Used: %d", len(blockSeqNos))
	e.t.Logf("Block Range: %d - %d (span of %d blocks)", blockSeqNos[0], blockSeqNos[len(blockSeqNos)-1], blockSeqNos[len(blockSeqNos)-1]-blockSeqNos[0]+1)

	totalGaps := 0
	for i := 1; i < len(blockSeqNos); i++ {
		gap := blockSeqNos[i] - blockSeqNos[i-1] - 1
		totalGaps += int(gap)
		if gap > 0 {
			e.t.Logf("Gap between blocks %d and %d: %d empty blocks", blockSeqNos[i-1], blockSeqNos[i], gap)
		}
	}
	e.t.Logf("Total Empty Blocks in Range: %d", totalGaps)

	// Block-level message count
	e.t.Logf("\n=== Messages per Block ===")
	for _, seqNo := range blockSeqNos {
		txs := blockTxMap[seqNo]
		totalMsgs := 0
		for _, tx := range txs {
			totalMsgs += tx.Messages
		}
		e.t.Logf("Block %d: %d transactions, %d messages", seqNo, len(txs), totalMsgs)
	}
	return allTxResults
}

func (e *EventEmitter) IsRunning() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.running
}

// TODO: use for live event ingestion test
func (e *EventEmitter) eventLoop() {
	e.t.Logf("Starting event loop for %s", e.name)
	for {
		select {
		case <-e.ctx.Done():
			e.t.Logf("Context cancelled for %s", e.name)
			return
		case <-e.ticker.C:
			if _, _, err := e.SendIncreaseCounterMsg(); err != nil {
				e.t.Logf("ERROR sending message from %s: %v", e.name, err)
				continue
			} else {
				e.t.Logf("message sent successfully from %s, sequence number: %d", e.name, e.lastCounter)
			}
		}
	}
}

func (e *EventEmitter) Name() string {
	return e.name
}

func (e *EventEmitter) ContractAddress() *address.Address {
	return e.contractAddress
}

func (e *EventEmitter) GetID() uint64 {
	return e.id
}

func (e *EventEmitter) LastSentCounter() uint64 {
	return e.lastCounter
}

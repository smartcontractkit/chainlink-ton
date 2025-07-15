package eventemitter

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"sort"
	"sync"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

// TODO: better name
type Config struct {
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

	// Dependencies
	client ton.APIClientWrapped // msg sender client
	wallet *wallet.Wallet
	lggr   logger.Logger

	// Context management
	ctx     context.Context
	cancel  context.CancelFunc
	ticker  *time.Ticker
	mu      sync.RWMutex
	running bool
}

func NewEventEmitter(ctx context.Context, client ton.APIClientWrapped, name string, id uint64, wallet *wallet.Wallet, lggr logger.Logger) (*EventEmitter, error) {
	addr, err := DeployEventEmitterContract(ctx, client, wallet, id)
	if err != nil {
		return nil, err
	}

	// verify the contract deployment
	b, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, err
	}

	resID, err := GetID(ctx, client, b, addr)
	if err != nil {
		return nil, err
	}
	if id != resID.Uint64() {
		return nil, fmt.Errorf("unexpected ID for %s: expected %d, got %d", name, id, resID.Uint64())
	}

	initialCounter, err := GetCounter(ctx, client, b, addr)
	if err != nil {
		return nil, err
	}
	if initialCounter.Cmp(big.NewInt(0)) != 0 {
		return nil, fmt.Errorf("expected initial counter to be 0, got %s", initialCounter.String())
	}

	return &EventEmitter{
		name:            name,
		client:          client,
		contractAddress: addr,
		id:              id,
		wallet:          wallet,
		lggr:            lggr,
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

func (e *EventEmitter) SendIncreaseCounterMsg(ctx context.Context) (*tlb.Transaction, *ton.BlockIDExt, error) {
	e.lggr.Debugf("Sending increase counter message from %s", e.name)
	msg := IncreaseCounterMsg(e.contractAddress)

	tx, block, err := e.wallet.SendWaitTransaction(ctx, msg)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to send message: %w", err)
	}

	return tx, block, nil
}

func (e *EventEmitter) SendMultipleIncreaseCounterMsg(ctx context.Context, count int) (*tlb.Transaction, *ton.BlockIDExt, error) {
	e.lggr.Debugf("Sending multiple increase counter messages from %s", e.name)

	messages := make([]*wallet.Message, count)
	for i := 0; i < count; i++ {
		msg := IncreaseCounterMsg(e.contractAddress)
		messages[i] = msg
	}
	tx, block, err := e.wallet.SendManyWaitTransaction(ctx, messages)
	if err != nil {
		e.lggr.Debugf("Failed to send multiple messages: %v", err)
		return nil, nil, err
	}

	return tx, block, nil
}

func (e *EventEmitter) CreateTestEvents(ctx context.Context, input Config) ([]TxResult, error) {
	var allTxResults []TxResult
	e.lggr.Debugf("=== Starting to send %d batches of %d transactions with %d messages each ===",
		input.TotalBatches, input.TxPerBatch, input.MsgPerTx)

	// Send transactions in batches with block waits
	for batchNum := 0; batchNum < input.TotalBatches; batchNum++ {
		// Send multiple transactions in this batch
		for txNum := 0; txNum < input.TxPerBatch; txNum++ {
			// Send transaction with multiple messages
			tx, block, err := e.SendMultipleIncreaseCounterMsg(ctx, input.MsgPerTx)
			if err != nil {
				return nil, fmt.Errorf("failed to send tx %d in batch %d: %w", txNum, batchNum, err)
			}

			txResult := TxResult{
				Tx:       tx,
				Block:    block,
				BatchNum: batchNum,
				TxNum:    txNum,
				MsgCount: input.MsgPerTx,
			}
			allTxResults = append(allTxResults, txResult)

			e.lggr.Debugf("Sent: Batch=%d, Tx=%d, Messages=%d, LT=%d, Hash=%s, BlockSeq=%d",
				batchNum, txNum, input.MsgPerTx, tx.LT, hex.EncodeToString(tx.Hash), block.SeqNo)
		}

		// Simple delay between batches to try to get different blocks
		if batchNum < input.TotalBatches-1 {
			currentBlockSeq := allTxResults[len(allTxResults)-1].Block.SeqNo
			e.lggr.Debugf("Waiting for block %d confirmation...", currentBlockSeq)

			// Wait for current block to be confirmed
			_, err := e.client.WaitForBlock(currentBlockSeq).GetAccount(ctx,
				allTxResults[len(allTxResults)-1].Block, e.ContractAddress())
			if err != nil {
				return nil, fmt.Errorf("failed to wait for block %d confirmation: %w", currentBlockSeq, err)
			}
			e.lggr.Debugf("Block %d confirmed", currentBlockSeq)
		}
	}

	e.lggr.Debugf("=== All transactions sent ===")
	e.lggr.Debugf("Total transactions: %d (each with %d messages)", len(allTxResults), input.MsgPerTx)

	e.logBlockDistribution(allTxResults)
	return allTxResults, nil
}

func (e *EventEmitter) logBlockDistribution(allTxResults []TxResult) {
	// Analyze block distribution
	blockCounts := make(map[uint32]int)
	blockTxs := make(map[uint32][]TxResult)

	for _, txResult := range allTxResults {
		blockSeq := txResult.Block.SeqNo
		blockCounts[blockSeq]++
		blockTxs[blockSeq] = append(blockTxs[blockSeq], txResult)
	}

	e.lggr.Debugf("=== Block Distribution Analysis ===")
	e.lggr.Debugf("Transactions distributed across %d unique blocks:", len(blockCounts))

	for blockSeq, count := range blockCounts {
		e.lggr.Debugf("Block %d: %d transactions", blockSeq, count)
		for _, txResult := range blockTxs[blockSeq] {
			e.lggr.Debugf("  - Batch %d, Tx %d (%d msgs): LT=%d, Hash=%s",
				txResult.BatchNum, txResult.TxNum, txResult.MsgCount, txResult.Tx.LT,
				hex.EncodeToString(txResult.Tx.Hash)[:16]+"...")
		}
	}

	if len(blockCounts) <= 1 {
		e.lggr.Debugf("WARNING: Expected transactions to be spread across multiple blocks, but only found %d block(s)", len(blockCounts))
	}

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
	e.lggr.Debugf("=== Transactions by Block SeqNo ===")
	e.lggr.Debugf("%-10s %-8s %-6s %-6s %-10s %-15s %-20s", "Block", "TxIndex", "Batch", "TxNum", "Messages", "LT", "Hash (first 16)")
	e.lggr.Debugf("%-10s %-8s %-6s %-6s %-10s %-15s %-20s", "------", "-------", "-----", "-----", "--------", "--", "---------------")

	for _, seqNo := range blockSeqNos {
		txs := blockTxMap[seqNo]
		for _, tx := range txs {
			e.lggr.Debugf("%-10d %-8d %-6d %-6d %-10d %-15d %-20s",
				seqNo, tx.TxIndex, tx.Batch, tx.TxNum, tx.Messages, tx.LT, tx.Hash[:16]+"...")
		}
	}

	// Output summary statistics
	e.lggr.Debugf("\n=== Block Distribution Summary ===")
	e.lggr.Debugf("Total Blocks Used: %d", len(blockSeqNos))
	if len(blockSeqNos) > 0 {
		e.lggr.Debugf("Block Range: %d - %d (span of %d blocks)", blockSeqNos[0], blockSeqNos[len(blockSeqNos)-1], blockSeqNos[len(blockSeqNos)-1]-blockSeqNos[0]+1)

		totalGaps := 0
		for i := 1; i < len(blockSeqNos); i++ {
			gap := blockSeqNos[i] - blockSeqNos[i-1] - 1
			totalGaps += int(gap)
			if gap > 0 {
				e.lggr.Debugf("Gap between blocks %d and %d: %d empty blocks", blockSeqNos[i-1], blockSeqNos[i], gap)
			}
		}
		e.lggr.Debugf("Total Empty Blocks in Range: %d", totalGaps)
	}
}

func (e *EventEmitter) IsRunning() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.running
}

// TODO: use for live event ingestion test
// eventLoop runs the continuous event emission loop
func (e *EventEmitter) eventLoop() {
	e.lggr.Debugf("Starting event loop for %s", e.name)
	for {
		select {
		case <-e.ctx.Done():
			e.lggr.Debugf("Context cancelled for %s", e.name)
			return
		case <-e.ticker.C:
			if _, _, err := e.SendIncreaseCounterMsg(e.ctx); err != nil {
				e.lggr.Debugf("ERROR sending message from %s: %v", e.name, err)
				continue
			} else {
				e.lggr.Debugf("message sent successfully from %s", e.name)
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

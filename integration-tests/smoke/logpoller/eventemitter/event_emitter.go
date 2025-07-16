package eventemitter

import (
	"context"
	"encoding/hex"
	"errors"
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
	BatchCount int
	TxPerBatch int
	MsgPerTx   int
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
	sentCounter     uint64
	targetCounter   *big.Int

	// Dependencies
	client ton.APIClientWrapped // msg sender client
	wallet *wallet.Wallet
	lggr   logger.Logger

	mu      sync.RWMutex
	running bool
	done    chan struct{}
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

func (e *EventEmitter) StartEventEmitter(ctx context.Context, interval time.Duration, targetCounter *big.Int) error {
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

func (e *EventEmitter) StopEventEmitter() {
	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.running {
		return
	}

	<-e.done
	e.running = false
}

func (e *EventEmitter) IsRunning() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.running
}

func (e *EventEmitter) eventLoop(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	target := e.targetCounter.Uint64()

	for {
		if e.sentCounter < target {
			select {
			case <-ctx.Done():
				e.lggr.Debugf("Context cancelled during sending for %s", e.name)
				close(e.done)
				return
			case <-ticker.C:
				if _, _, err := e.SendIncreaseCounterMsg(ctx); err != nil {
					e.lggr.Debugf("ERROR sending message from %s: %v", e.name, err)
				} else {
					e.mu.Lock()
					e.sentCounter++
					e.mu.Unlock()
				}
			}
			continue
		}

		// all messages have been sent. confirm the on-chain state.
		if e.shouldStop(ctx) {
			e.lggr.Debugf("On-chain counter confirmed for %s, stopping.", e.name)
			close(e.done)
			return
		}

		select {
		case <-ctx.Done():
			e.lggr.Debugf("Context cancelled during verification for %s", e.name)
			close(e.done)
			return
		case <-ticker.C:
			e.lggr.Debugf("All messages sent, waiting for on-chain confirmation...")
		}
	}
}

func (e *EventEmitter) shouldStop(ctx context.Context) bool {
	if e.targetCounter == nil {
		return false
	}

	b, err := e.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		e.lggr.Debugf("ERROR getting masterchain info for %s: %v", e.name, err)
		return false
	}

	currentCounter, err := GetCounter(ctx, e.client, b, e.contractAddress)
	if err != nil {
		e.lggr.Debugf("ERROR getting counter for %s: %v", e.name, err)
		return false
	}

	return currentCounter.Cmp(e.targetCounter) >= 0
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

func (e *EventEmitter) CreateBulkTestEvents(ctx context.Context, cfg Config) ([]TxResult, error) {
	var txs []TxResult
	e.lggr.Debugf("=== Starting to send %d batches of %d transactions with %d messages each ===",
		cfg.BatchCount, cfg.TxPerBatch, cfg.MsgPerTx)

	// Send transactions in batches with block waits
	for batchNum := 0; batchNum < cfg.BatchCount; batchNum++ {
		// Send multiple transactions in this batch
		for txNum := 0; txNum < cfg.TxPerBatch; txNum++ {
			// Send transaction with multiple messages
			e.lggr.Debugf("╭ Sending multiple increase counter messages from %s", e.name)
			tx, block, err := e.SendMultipleIncreaseCounterMsg(ctx, cfg.MsgPerTx)
			if err != nil {
				return nil, fmt.Errorf("failed to send tx %d in batch %d: %w", txNum, batchNum, err)
			}

			txResult := TxResult{
				Tx:       tx,
				Block:    block,
				BatchNum: batchNum,
				TxNum:    txNum,
				MsgCount: cfg.MsgPerTx,
			}
			txs = append(txs, txResult)

			e.lggr.Debugf("╰ Sent: Batch=%d, Tx=%d, Messages=%d, LT=%d, Hash=%s, BlockSeq=%d",
				batchNum, txNum, cfg.MsgPerTx, tx.LT, hex.EncodeToString(tx.Hash), block.SeqNo)
		}

		// delay between batches to try to get different blocks
		if batchNum < cfg.BatchCount-1 {
			currentBlockSeq := txs[len(txs)-1].Block.SeqNo
			e.lggr.Debugf("Block %d: waiting for confirmation...", currentBlockSeq)

			// wait for current block to be confirmed
			_, err := e.client.WaitForBlock(currentBlockSeq).GetAccount(ctx, txs[len(txs)-1].Block, e.ContractAddress())
			if err != nil {
				return nil, fmt.Errorf("failed to wait for block %d confirmation: %w", currentBlockSeq, err)
			}
			e.lggr.Debugf("Block %d: confirmed", currentBlockSeq)
		}
	}
	e.logBlockDistribution(txs)
	return txs, nil
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
	blockSeqNos := make([]uint32, 0, len(blockTxMap))
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
	}
}

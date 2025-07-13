package eventemitter

import (
	"context"
	"encoding/base64"
	"fmt"
	"math/big"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

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

	tx, block, err := wallet.SendWaitTransaction(ctx, IncreaseCounterMsg(addr))
	require.NoError(t, err)

	account, err := client.GetAccount(ctx, block, addr)
	if err == nil {
		t.Logf("Contract balance: %s", account.State.Balance.String())
		t.Logf("Contract last transaction LT: %d", account.LastTxLT)
		t.Logf("Contract last transaction hash: %s", base64.StdEncoding.EncodeToString(account.LastTxHash))
	}

	// CORRECT OUTPUT MESSAGE ANALYSIS using your pattern
	if tx.IO.Out == nil {
		t.Logf("❌ No output messages found!")
	} else {
		msgs, err := tx.IO.Out.ToSlice()
		if err != nil {
			t.Logf("❌ Error converting output messages: %v", err)
		} else {
			t.Logf("Transaction has %d output messages", len(msgs))

			for i, msg := range msgs {
				t.Logf("=== Output Message %d ===", i)
				t.Logf("Message type: %s", msg.MsgType)

				// Check if it's an external out message (your events)
				if msg.MsgType == tlb.MsgTypeExternalOut {
					ext := msg.AsExternalOut()
					t.Logf("✅ Found external out message (event)")

					if ext.Body != nil {
						t.Logf("Event body: %d bits, %d refs", ext.Body.BitsSize(), ext.Body.RefsNum())

						// Parse the event data
						bodySlice := ext.Body.BeginParse()
						if bodySlice.BitsLeft() >= 32 {
							eventTopic, err := bodySlice.LoadUInt(32)
							if err == nil {
								t.Logf("Event topic: 0x%x", eventTopic)

								if eventTopic == 0x1234 { // COUNTER_INCREASED_TOPIC
									t.Logf("🎉 COUNTER_INCREASED event found!")
									if bodySlice.BitsLeft() >= 128 {
										id, _ := bodySlice.LoadUInt(64)
										counter, _ := bodySlice.LoadUInt(64)
										t.Logf("Event data - ID: %d, Counter: %d", id, counter)
									}
								} else if eventTopic == 0x5678 { // COUNTER_RESET_TOPIC
									t.Logf("🎉 COUNTER_RESET event found!")
									if bodySlice.BitsLeft() >= 64 {
										id, _ := bodySlice.LoadUInt(64)
										t.Logf("Event data - ID: %d", id)
									}
								} else {
									t.Logf("❓ Unknown event topic: 0x%x", eventTopic)
								}
							} else {
								t.Logf("❌ Error parsing event topic: %v", err)
							}
						}

						// Raw event body for debugging
						bodyBOC := base64.StdEncoding.EncodeToString(ext.Body.ToBOC())
						t.Logf("Raw event body BOC: %s", bodyBOC)
					} else {
						t.Logf("❌ External message has no body")
					}
				} else if msg.MsgType == tlb.MsgTypeInternal {
					internal := msg.AsInternal()
					t.Logf("📝 Internal message to: %s", internal.DstAddr.String())
					t.Logf("📝 Internal message amount: %s", internal.Amount.String())

					if internal.Body != nil {
						t.Logf("Internal message body: %d bits", internal.Body.BitsSize())
						bodyBOC := base64.StdEncoding.EncodeToString(internal.Body.ToBOC())
						t.Logf("Internal message body BOC: %s", bodyBOC)
					}
					// Internal messages are not events, but contract-to-contract calls
				} else {
					t.Logf("❓ Other message type: %s", msg.MsgType)
				}
			}
		}
	}

	// Check transaction success details
	if tx.Description != nil {
		t.Logf("Transaction description type: %T", tx.Description)
		// Try to get more details about why it might be failing
	}

	// Use the SAME block where transaction was processed
	counterAfterTx, err := GetCounter(ctx, client, block, addr)
	require.NoError(t, err)
	t.Logf("Counter after initial transaction (same block): %d", counterAfterTx.Uint64())

	// Wait and check from a newer block
	time.Sleep(3 * time.Second)
	freshBlock, err := client.CurrentMasterchainInfo(ctx)
	require.NoError(t, err)
	t.Logf("Fresh block: %d", freshBlock.SeqNo)

	counterFromFresh, err := GetCounter(ctx, client, freshBlock, addr)
	require.NoError(t, err)
	t.Logf("Counter from fresh block: %d", counterFromFresh.Uint64())

	require.Eventually(t, func() bool {
		bbb, err := client.CurrentMasterchainInfo(ctx)
		require.NoError(t, err)
		increasedCounter, err := GetCounter(ctx, client, bbb, addr)
		require.NoError(t, err)
		return increasedCounter.Cmp(big.NewInt(0)) > 0
	}, 10*time.Second, 2*time.Second)

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

func (e *EventEmitter) SendIncreaseCounterMsg() error {
	msg := IncreaseCounterMsg(e.contractAddress)

	_, _, err := e.wallet.SendWaitTransaction(e.ctx, msg)
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}
	// Update counter after successful send
	e.mu.Lock()
	e.lastCounter++
	e.mu.Unlock()

	return nil
}

func (e *EventEmitter) IsRunning() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.running
}

func (e *EventEmitter) eventLoop() {
	e.t.Logf("Starting event loop for %s", e.name)
	for {
		select {
		case <-e.ctx.Done():
			e.t.Logf("Context cancelled for %s", e.name)
			return
		case <-e.ticker.C:
			if err := e.SendIncreaseCounterMsg(); err != nil {
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

func (e *EventEmitter) GetSelector() uint64 {
	return e.id
}

func (e *EventEmitter) LastSentCounter() uint64 {
	return e.lastCounter
}

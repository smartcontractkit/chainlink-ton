package eventemitter

import (
	"context"
	"fmt"
	"math/big"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

type EventEmitter struct {
	name              string           // name of the event emitter
	contractAddress   *address.Address // address of the event emitter contract
	destChainSelector uint64
	lastSeqNo         uint64

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

func NewEventEmitter(t *testing.T, client ton.APIClientWrapped, name string, destChainSelector uint64, wallet *wallet.Wallet) (*EventEmitter, error) {
	ctx := t.Context()
	addr, err := DeployEventEmitterContract(ctx, client, wallet, destChainSelector)
	if err != nil {
		return nil, err
	}

	b, err := client.CurrentMasterchainInfo(ctx)
	require.NoError(t, err)

	resDestChainSel, err := GetDestinationChain(ctx, client, b, addr)
	require.NoError(t, err)
	require.Equal(t, destChainSelector, resDestChainSel.Uint64(), "unexpected destination chain selector for "+name)

	_, _, err = wallet.SendWaitTransaction(ctx, CCIPSendMessage(addr))
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		b, err := client.CurrentMasterchainInfo(ctx)
		require.NoError(t, err)
		increasedSeqNo, err := GetSequenceNumber(ctx, client, b, addr)
		require.NoError(t, err)
		return increasedSeqNo.Cmp(big.NewInt(0)) > 0
	}, 30*time.Second, 2*time.Second)

	return &EventEmitter{
		t:                 t,
		ctx:               ctx,
		name:              name,
		client:            client,
		contractAddress:   addr,
		destChainSelector: destChainSelector,
		wallet:            wallet,
		lastSeqNo:         0,
		running:           false,
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

// SendCCIPMessage sends a single CCIP message immediately
func (e *EventEmitter) SendCCIPMessage() error {
	msg := CCIPSendMessage(e.contractAddress)

	_, _, err := e.wallet.SendWaitTransaction(e.ctx, msg)
	if err != nil {
		return fmt.Errorf("failed to send CCIP message: %w", err)
	}

	// Update sequence number after successful send
	e.mu.Lock()
	e.lastSeqNo++
	e.mu.Unlock()

	return nil
}

// ResetContract sends a reset message to the contract
func (e *EventEmitter) ResetContract() error {
	msg := ResetMessage(e.contractAddress)

	_, _, err := e.wallet.SendWaitTransaction(e.ctx, msg)
	if err != nil {
		return fmt.Errorf("failed to send reset message: %w", err)
	}

	// Reset local sequence number
	e.mu.Lock()
	e.lastSeqNo = 0
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
			if err := e.SendCCIPMessage(); err != nil {
				e.t.Logf("ERROR sending CCIP message from %s: %v", e.name, err)
				continue
			} else {
				e.t.Logf("CCIP message sent successfully from %s, sequence number: %d", e.name, e.lastSeqNo)
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

func (e *EventEmitter) DestinationChainSelector() uint64 {
	return e.destChainSelector
}

func (e *EventEmitter) LastSentSequenceNumber() uint64 {
	return e.lastSeqNo
}

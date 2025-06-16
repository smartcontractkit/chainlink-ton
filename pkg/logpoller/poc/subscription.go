package poc

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/test-go/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
)

type EventSubscriber struct {
	subscriptions map[string]context.CancelFunc // contract address -> cancel func
	events        chan Event
	registry      *ContractEventRegistry
	mu            sync.RWMutex
}

func StartEventSubscription(t *testing.T, client ton.APIClientWrapped, registry *ContractEventRegistry) *EventSubscriber {
	evs := &EventSubscriber{
		subscriptions: make(map[string]context.CancelFunc),
		events:        make(chan Event, 10),
		registry:      registry,
	}

	// Subscribe to all registered contracts
	contractAddresses := registry.GetRegisteredContracts()
	for _, contractAddr := range contractAddresses {
		err := evs.subscribeToContract(client, contractAddr)
		require.NoError(t, err, "Failed to subscribe to contract %s", contractAddr.String())
	}

	t.Logf("Event monitoring started for %d contracts", len(contractAddresses))
	return evs
}

func (evs *EventSubscriber) subscribeToContract(client ton.APIClientWrapped, contractAddr *address.Address) error {
	master, err := client.CurrentMasterchainInfo(context.Background())
	if err != nil {
		return fmt.Errorf("failed to get masterchain info: %w", err)
	}

	acc, err := client.GetAccount(context.Background(), master, contractAddr)
	if err != nil {
		return fmt.Errorf("failed to get contract account: %w", err)
	}

	transactions := make(chan *tlb.Transaction, 10)
	subscriptionCtx, cancel := context.WithCancel(context.Background())

	evs.mu.Lock()
	evs.subscriptions[contractAddr.String()] = cancel
	evs.mu.Unlock()

	// Start subscription
	go client.SubscribeOnTransactions(subscriptionCtx, contractAddr, acc.LastTxLT, transactions)

	// Start event parsing for this contract
	go evs.parseEventsForContract(transactions, contractAddr)

	return nil
}

func (evs *EventSubscriber) parseEventsForContract(transactions <-chan *tlb.Transaction, contractAddr *address.Address) {
	for tx := range transactions {
		events := evs.registry.ParseEventsFromTransaction(tx)
		for _, event := range events {
			select {
			case evs.events <- event:
			default:
				fmt.Printf("WARNING: Event buffer full, skipping event from %s\n", contractAddr.String())
			}
		}
	}
}

func (evs *EventSubscriber) WaitForEvent(predicate func(*Event) bool, timeout time.Duration) (*Event, error) {
	start := time.Now()
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	for {
		select {
		case event := <-evs.events:
			if predicate(&event) {
				elapsed := time.Since(start)
				fmt.Printf("=== Event received after %s\n", elapsed)
				return &event, nil
			}
		case <-timer.C:
			elapsed := time.Since(start)
			fmt.Printf("=== Timeout after %s\n", elapsed)
			return nil, fmt.Errorf("timeout waiting for event")
		}
	}
}

func (evs *EventSubscriber) Stop() {
	evs.mu.Lock()
	defer evs.mu.Unlock()

	for contractAddr, cancel := range evs.subscriptions {
		fmt.Printf("Stopping subscription for contract: %s\n", contractAddr)
		cancel()
	}
	evs.subscriptions = make(map[string]context.CancelFunc)
}

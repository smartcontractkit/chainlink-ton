package poc

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/test-go/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
)

type EventSubscriber struct {
	transactions chan *tlb.Transaction
	cancel       context.CancelFunc
	events       chan Event
}

func StartEventSubscription(t *testing.T, client ton.APIClientWrapped, contractAddress *address.Address) *EventSubscriber {
	master, err := client.CurrentMasterchainInfo(context.Background())
	require.NoError(t, err, "Failed to get masterchain info")

	acc, err := client.GetAccount(context.Background(), master, contractAddress)
	require.NoError(t, err, "Failed to get contract account")

	// Setup subscription
	transactions := make(chan *tlb.Transaction, 10)
	events := make(chan Event, 10)

	subscriptionCtx, cancel := context.WithCancel(context.Background())
	go client.SubscribeOnTransactions(subscriptionCtx, contractAddress, acc.LastTxLT, transactions)

	evs := &EventSubscriber{
		transactions: transactions,
		cancel:       cancel,
		events:       events,
	}

	// Start event parsing
	go evs.parseEvents()

	t.Log("Event monitoring started")
	return evs
}

func (evs *EventSubscriber) parseEvents() {
	for tx := range evs.transactions {
		events := ParseEventsFromTransaction(tx)
		for _, event := range events {
			select {
			case evs.events <- event:
			default:
				// Buffer full, skip event
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
	if evs.cancel != nil {
		evs.cancel()
	}
}

package poc

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"
)

func PollEventsFromContracts(
	ctx context.Context,
	client ton.APIClientWrapped,
	pool *liteclient.ConnectionPool,
	registry *ContractEventRegistry,
	maxTransactions int,
) ([]Event, error) {
	var allEvents []Event

	// Get all registered contract addresses from registry
	contractAddresses := registry.GetRegisteredContracts()
	if len(contractAddresses) == 0 {
		return allEvents, nil
	}

	pollingCtx := pool.StickyContext(ctx)

	// Poll each registered contract
	for _, contractAddr := range contractAddresses {
		events, err := pollSingleContract(pollingCtx, client, contractAddr, registry, maxTransactions)
		if err != nil {
			return allEvents, fmt.Errorf("failed to poll contract %s: %w", contractAddr.String(), err)
		}
		allEvents = append(allEvents, events...)
	}

	return allEvents, nil
}

func pollSingleContract(
	ctx context.Context,
	client ton.APIClientWrapped,
	contractAddr *address.Address,
	registry *ContractEventRegistry,
	maxTransactions int,
) ([]Event, error) {
	var events []Event

	b, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get block info: %w", err)
	}

	acc, err := client.WaitForBlock(b.SeqNo).GetAccount(ctx, b, contractAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to get contract account: %w", err)
	}

	lastHash := acc.LastTxHash
	lastLt := acc.LastTxLT
	processedCount := 0

	for processedCount < maxTransactions {
		if lastLt == 0 {
			break
		}

		list, err := client.ListTransactions(ctx, contractAddr, 15, lastLt, lastHash)
		if err != nil {
			return events, fmt.Errorf("failed to list transactions: %w", err)
		}

		if len(list) == 0 {
			break
		}

		lastHash = list[0].PrevTxHash
		lastLt = list[0].PrevTxLT

		for _, tx := range list {
			processedCount++
			txEvents := registry.ParseEventsFromTransaction(tx)
			events = append(events, txEvents...)

			if processedCount >= maxTransactions {
				break
			}
		}
	}

	return events, nil
}

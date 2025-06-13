package poc

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"
)

// PollEventsFromTransactions polls historical transactions and extracts events.
// It returns all parsed events up to the max count or until genesis.
func PollEventsFromTransactions(
	ctx context.Context,
	client ton.APIClientWrapped,
	pool *liteclient.ConnectionPool,
	contractAddr *address.Address,
	maxTransactions int,
) ([]Event, error) {
	var allEvents []Event

	// Use sticky context for consistent node selection
	pollingCtx := pool.StickyContext(ctx)

	// Get block and account state
	b, err := client.CurrentMasterchainInfo(pollingCtx)
	if err != nil {
		return nil, fmt.Errorf("failed to get block info: %w", err)
	}

	acc, err := client.WaitForBlock(b.SeqNo).GetAccount(pollingCtx, b, contractAddr)
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

		// ListTransactions - returns list of transactions before (including) passed lt and hash, the oldest one is first in result slice
		// Transactions will be verified to match final tx hash, which should be taken from proved account state, then it is safe.
		list, err := client.ListTransactions(pollingCtx, contractAddr, 15, lastLt, lastHash)
		if err != nil {
			return allEvents, fmt.Errorf("failed to list transactions: %w", err)
		}

		if len(list) == 0 {
			break
		}

		// Update next page cursor
		lastHash = list[0].PrevTxHash
		lastLt = list[0].PrevTxLT

		for _, tx := range list {
			processedCount++
			events := ParseEventsFromTransaction(tx)
			allEvents = append(allEvents, events...)

			if processedCount >= maxTransactions {
				break
			}
		}
	}

	return allEvents, nil
}

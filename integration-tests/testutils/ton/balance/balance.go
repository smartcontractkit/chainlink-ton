package balance

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
)

func MustGet(t *testing.T, client ton.APIClientWrapped, address *address.Address) *tlb.Coins {
	balance, err := Get(client, address)
	require.NoError(t, err, "failed to get balance: %w", err)
	return balance
}

// returns balance of the account in nanotons
func Get(apiClient ton.APIClientWrapped, address *address.Address) (*tlb.Coins, error) {
	ctx := apiClient.Client().StickyContext(context.Background())
	master, err := apiClient.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get masterchain info for funder balance check: %w", err)
	}

	// we use WaitForBlock to make sure block is ready,
	// it is optional but escapes us from liteserver block not ready errors
	res, err := apiClient.WaitForBlock(master.SeqNo).GetAccount(ctx, master, address)
	if err != nil {
		return nil, fmt.Errorf("get account err: %w", err)
	}
	if res.IsActive {
		return &res.State.Balance, nil
	}
	return nil, errors.New("account is not active")
}

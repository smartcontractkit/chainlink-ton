package balance

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

func MustGet(t *testing.T, apiClient tracetracking.SignedAPIClient) *tlb.Coins {
	balance, err := Get(apiClient)
	require.NoError(t, err, "failed to get balance: %w", err)
	return balance
}

// returns balance of the account in nanotons
func Get(apiClient tracetracking.SignedAPIClient) (*tlb.Coins, error) {
	ctx := apiClient.Client.Client().StickyContext(context.Background())
	master, err := apiClient.Client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get masterchain info for funder balance check: %w", err)
	}

	// we use WaitForBlock to make sure block is ready,
	// it is optional but escapes us from liteserver block not ready errors
	res, err := apiClient.Client.WaitForBlock(master.SeqNo).GetAccount(ctx, master, apiClient.Wallet.WalletAddress())
	if err != nil {
		return nil, fmt.Errorf("get account err: %w", err)
	}
	if res.IsActive {
		return &res.State.Balance, nil
	}
	return nil, errors.New("account is not active")
}

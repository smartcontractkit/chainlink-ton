package contracts

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/contracts/tests/testutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
)

func TestCounter(t *testing.T) {
	var client *ton.APIClient

	t.Run("setup:localnet", func(t *testing.T) {
		client = testutils.ConnectLocalnet(t)
	})

	admin, aerr := tonutils.GetRandomWallet(client, wallet.V3R2, wallet.WithWorkchain(0))
	require.NoError(t, aerr, "Failed to get random wallet")

	t.Run("setup:funding", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		fundAmount := tlb.MustFromTON("0.5")
		recipients := []testutils.FundRecipient{
			{
				Address: admin.Address(),
				Amount:  &fundAmount,
			},
		}
		ferr := testutils.FundAccounts(ctx, recipients, client, t)
		require.NoError(t, ferr, "Failed to fund accounts")
	})

	t.Run("deploy counter", func(t *testing.T) {
		t.Skip("TODO: deploy counter")
	})
	t.Run("get initial counter", func(t *testing.T) {
		t.Skip("TODO: get initial counter")
	})
	t.Run("set counter", func(t *testing.T) {
		t.Skip("TODO: set counter value")
	})
}

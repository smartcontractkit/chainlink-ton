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

	admin, aerr := tonutils.GetRandomWallet(client, wallet.V3R2, wallet.WithWorkchain(0))
	require.NoError(t, aerr, "Failed to get random wallet")

	t.Run("setup", func(t *testing.T) {
		client = testutils.ConnetLocalnet(t)

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
}

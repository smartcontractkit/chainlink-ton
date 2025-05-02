package testutils_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/contracts/tests/testutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
)

func TestLocalnet(t *testing.T) {
	var client *ton.APIClient

	t.Run("setup", func(t *testing.T) {
		client = testutils.ConnectLocalnet(t)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		recipient, err := tonutils.GetRandomWallet(client, wallet.V3R2, wallet.WithWorkchain(0))
		require.NoError(t, err, "Failed to get random wallet")

		fundAmount := tlb.MustFromTON("0.5")
		recipients := []testutils.FundRecipient{
			{
				Address: recipient.Address(),
				Amount:  &fundAmount,
			},
		}
		ferr := testutils.FundAccounts(ctx, recipients, client, t)
		require.NoError(t, ferr, "Failed to fund accounts")
	})

	t.Run("setup:funding with multiple accounts", func(t *testing.T) {
		// Note: tested upto 1000 accounts, reduced for test speed
		nums := []int{10, 100}
		for _, num := range nums {
			t.Run(fmt.Sprintf("N=%d", num), func(t *testing.T) {
				recipients := make([]testutils.FundRecipient, num)

				for i := 0; i < num; i++ {
					recipient, rerr := tonutils.GetRandomWallet(client, wallet.V3R2, wallet.WithWorkchain(0))
					require.NoError(t, rerr, "Failed to get random wallet")
					fundAmount := tlb.MustFromTON("0.5")
					recipients[i] = testutils.FundRecipient{
						Address: recipient.Address(),
						Amount:  &fundAmount,
					}
				}
				ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
				defer cancel()
				ferr := testutils.FundAccounts(ctx, recipients, client, t)
				require.NoError(t, ferr, "Failed to fund accounts")
			})
		}
	})
}

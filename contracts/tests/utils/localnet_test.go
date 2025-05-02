package utils_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/contracts/tests/utils"
)

func TestLocalnet(t *testing.T) {
	var client *ton.APIClient

	t.Run("setup:localnet", func(t *testing.T) {
		client = utils.ConnetLocalnet(t)
	})

	t.Run("setup:funding", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		recipient := utils.GetRandomWallet(t, client, wallet.V3R2, wallet.WithWorkchain(0))

		fundAmount := tlb.MustFromTON("0.5")
		recipients := []utils.FundRecipient{
			{
				Address: recipient.Address(),
				Amount:  &fundAmount,
			},
		}
		ferr := utils.FundAccounts(ctx, recipients, client, t)
		require.NoError(t, ferr, "Failed to fund accounts")
	})

	t.Run("setup:funding with multiple accounts", func(t *testing.T) {
		// Note: tested upto 1000 accounts, reduced for test speed
		nums := []int{10, 100}
		for _, num := range nums {
			t.Run(fmt.Sprintf("N=%d", num), func(t *testing.T) {
				recipients := make([]utils.FundRecipient, num)

				for i := 0; i < num; i++ {
					recipient := utils.GetRandomWallet(t, client, wallet.V3R2, wallet.WithWorkchain(0))
					fundAmount := tlb.MustFromTON("0.5")
					recipients[i] = utils.FundRecipient{
						Address: recipient.Address(),
						Amount:  &fundAmount,
					}
				}
				ctx := context.Background()
				ferr := utils.FundAccounts(ctx, recipients, client, t)
				require.NoError(t, ferr, "Failed to fund accounts")
			})
		}
	})
}

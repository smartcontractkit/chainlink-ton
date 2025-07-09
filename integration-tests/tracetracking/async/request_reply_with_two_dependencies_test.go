package async

import (
	"fmt"
	"math/big"
	"math/rand/v2"
	"testing"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"

	"integration-tests/tracetracking/async/wrappers/requestreplywithtwodependencies"
	"integration-tests/tracetracking/testutils"
)

type Item struct {
	PriceAddr *address.Address
	CountAddr *address.Address
}

func TestRequestReplyWithTwoDependencies(t *testing.T) {
	var initialAmount = big.NewInt(1_000_000_000_000)
	seeders := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 1)

	t.Run("TestRequestReplyWithTwoDependencies", func(t *testing.T) {
		alice := seeders[0]

		fmt.Printf("\n\n\n\n\n\nTest Setup\n==========================\n")

		priceIndex := []string{
			"apple",
			"banana",
		}
		prices := map[string]uint64{
			"apple":  100,
			"banana": 200,
		}
		quantity := map[string]uint64{
			"apple":  5,
			"banana": 3,
		}
		itemAddresses := make([]Item, len(priceIndex))

		fmt.Printf("Deploying ItemPrice and ItemCount contracts\n")
		for index, name := range priceIndex {
			fmt.Printf("Deploying ItemPrice %s", name)
			itemPrice, err := requestreplywithtwodependencies.NewItemPriceProvider(alice).Deploy(requestreplywithtwodependencies.ItemPriceInitData{ID: (rand.Uint32()), Price: prices[name]})
			require.NoError(t, err, "failed to deploy ItemPrice contract: %w", err)
			fmt.Printf("ItemPrice contract deployed at %s\n", itemPrice.Contract.Address.String())

			fmt.Printf("Deploying ItemCount %s", name)
			itemCount, err := requestreplywithtwodependencies.NewItemCountProvider(alice).Deploy(requestreplywithtwodependencies.ItemCountInitData{ID: (rand.Uint32()), Count: quantity[name]})
			require.NoError(t, err, "failed to deploy ItemCount contract: %w", err)
			fmt.Printf("ItemCount contract deployed at %s\n", itemCount.Contract.Address.String())

			itemAddresses[index] = Item{itemPrice.Contract.Address, itemCount.Contract.Address}
		}

		fmt.Printf("Deploying Inventory contract with addresses %+v: \n", itemAddresses)
		inventory, err := requestreplywithtwodependencies.NewInventoryProvider(alice).Deploy(requestreplywithtwodependencies.InventoryInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy Inventory contract: %w", err)
		fmt.Printf("Inventory contract deployed at %s\n", inventory.Contract.Address.String())

		for index, name := range priceIndex {
			fmt.Printf("Sending AddItem request for %s, key: %d, priceAddr: %s, countAddr: %s\n", name, index, itemAddresses[index].PriceAddr.String(), itemAddresses[index].CountAddr.String())
			_, serr := inventory.SendAddItem(uint8(index), itemAddresses[index].PriceAddr, itemAddresses[index].CountAddr) //nolint:gosec // testing purpose
			require.NoError(t, serr, "failed to send AddItem request: %w", serr)
			fmt.Printf("AddItem request sent\n")
		}

		fmt.Printf("Deploying Storage contract\n")
		storage, err := requestreplywithtwodependencies.NewStorageProvider(alice).Deploy(requestreplywithtwodependencies.StorageInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy Storage contract: %w", err)
		fmt.Printf("Storage contract deployed at %s\n", storage.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")

		for index, name := range priceIndex {
			fmt.Printf("Sending GetCapitalFrom request for %s\n", name)
			_, err = storage.SendGetCapitalFrom(inventory.Contract.Address, uint8(index)) //nolint:gosec // testing purpose
			require.NoError(t, err, "failed to send GetCapitalFrom request: %w", err)
			fmt.Printf("GetCapitalFrom request sent\n")

			fmt.Printf("Checking result\n")
			result, err := storage.GetValue()
			require.NoError(t, err, "failed to get value: %w", err)
			expectedCapital := prices[name] * quantity[name]
			assert.Equal(t, expectedCapital, result, "Expected capital %d, got %d", expectedCapital, result)
			fmt.Printf("Result: %d\n", result)
		}

		fmt.Printf("Test completed successfully\n")
	})
}

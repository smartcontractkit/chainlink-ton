package async_communication

import (
	"fmt"
	"math/big"
	"math/rand/v2"
	"testing"

	wrappers "github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/async_communication/wrappers/request_reply_with_two_dependencies"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/stretchr/testify/assert"
	"github.com/xssnick/tonutils-go/address"
)

type Item struct {
	PriceAddr *address.Address
	CountAddr *address.Address
}

func TestRequestReplyWithTwoDependencies(t *testing.T) {
	t.Run("TestRequestReplyWithTwoDependencies", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		seeders := test_utils.SetUpTest(t, initialAmount, 1, bc.Nodes[0].ExternalHTTPUrl)
		alice := seeders[0]

		const transferAmount = 100

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
			itemPrice, err := wrappers.NewItemPriceProvider(alice).Deploy(wrappers.ItemPriceInitData{ID: (rand.Uint32()), Price: prices[name]})
			assert.NoError(t, err, "Failed to deploy ItemPrice contract: %v", err)
			fmt.Printf("ItemPrice contract deployed at %s\n", itemPrice.Contract.Address.String())

			fmt.Printf("Deploying ItemCount %s", name)
			itemCount, err := wrappers.NewItemCountProvider(alice).Deploy(wrappers.ItemCountInitData{ID: (rand.Uint32()), Count: quantity[name]})
			assert.NoError(t, err, "Failed to deploy ItemCount contract: %v", err)
			fmt.Printf("ItemCount contract deployed at %s\n", itemCount.Contract.Address.String())

			itemAddresses[index] = Item{itemPrice.Contract.Address, itemCount.Contract.Address}

		}

		fmt.Printf("Deploying Inventory contract with addresses %+v: \n", itemAddresses)
		inventory, err := wrappers.NewInventoryProvider(alice).Deploy(wrappers.InventoryInitData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy Inventory contract: %v", err)
		fmt.Printf("Inventory contract deployed at %s\n", inventory.Contract.Address.String())

		for index, name := range priceIndex {
			fmt.Printf("Sending AddItem request for %s, key: %d, priceAddr: %s, countAddr: %s\n", name, uint8(index), itemAddresses[index].PriceAddr.String(), itemAddresses[index].CountAddr.String())
			_, _, err := inventory.SendAddItem(uint8(index), itemAddresses[index].PriceAddr, itemAddresses[index].CountAddr)
			assert.NoError(t, err, "Failed to send AddItem request: %v", err)
			fmt.Printf("AddItem request sent\n")
		}

		fmt.Printf("Deploying Storage contract\n")
		storage, err := wrappers.NewStorageProvider(alice).Deploy(wrappers.StorageInitData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy Storage contract: %v", err)
		fmt.Printf("Storage contract deployed at %s\n", storage.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")

		for index, name := range priceIndex {
			fmt.Printf("Sending GetCapitalFrom request for %s\n", name)
			_, _, err = storage.SendGetCapitalFrom(inventory.Contract.Address, uint8(index))
			assert.NoError(t, err, "Failed to send GetCapitalFrom request: %v", err)
			fmt.Printf("GetCapitalFrom request sent\n")

			fmt.Printf("Checking result\n")
			result, err := storage.GetValue()
			assert.NoError(t, err, "Failed to get value: %v", err)
			expectedCapital := prices[name] * quantity[name]
			assert.Equal(t, expectedCapital, result, "Expected capital %d, got %d", expectedCapital, result)
			fmt.Printf("Result: %d\n", result)
		}

		fmt.Printf("Test completed successfully\n")
	})
}

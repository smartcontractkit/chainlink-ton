package experimentation

import (
	"fmt"
	"math/rand/v2"
	"testing"
	"time"

	wrappers "github.com/smartcontractkit/chainlink-ton/contracts/wrappers/examples/request_reply_with_two_dependencies"
	"github.com/stretchr/testify/assert"
	"github.com/xssnick/tonutils-go/address"
)

type Item struct {
	PriceAddr *address.Address
	CountAddr *address.Address
}

func TestRequestReplyWithTwoDependencies(t *testing.T) {
	t.Run("TestRequestReplyWithTwoDependencies", func(t *testing.T) {
		const initialAmmount = 1_000_000_000_000
		seeders := setUpTest(t, initialAmmount, 1)
		alice := seeders[0]

		const transferAmount = 100
		actorRegistry := NewActorRegistry(alice)
		actorRegistry.AddActor(alice.Wallet.WalletAddress(), uint64(0), "Alice")

		Logf("\n\n\n\n\n\nTest Setup\n==========================\n")

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
		newVar := len(priceIndex)
		itemAddresses := make([]Item, newVar)
		Logf("len(itemAddresses): %d\n", len(itemAddresses))

		Logf("Deploying ItemPrice contracts\n")
		for index, name := range priceIndex {
			Logf("Deploying ItemPrice %s", name)
			itemPrice, err := wrappers.NewItemPriceProvider(alice).Deploy(wrappers.ItemPriceIninData{ID: (rand.Uint32()), Price: prices[name]})
			assert.NoError(t, err, "Failed to deploy ItemPrice contract: %v", err)
			Logf("ItemPrice contract deployed at %s\n", itemPrice.Contract.Address.String())
			actorRegistry.AddActor(itemPrice.Contract.Address, uint64(0), fmt.Sprintf("ItemPrice%s", name))

			Logf("Deploying ItemCount %s", name)
			itemCount, err := wrappers.NewItemCountProvider(alice).Deploy(wrappers.ItemCountIninData{ID: (rand.Uint32()), Count: quantity[name]})
			assert.NoError(t, err, "Failed to deploy ItemCount contract: %v", err)
			Logf("ItemCount contract deployed at %s\n", itemCount.Contract.Address.String())
			actorRegistry.AddActor(itemCount.Contract.Address, uint64(0), fmt.Sprintf("ItemCount%s", name))

			itemAddresses[index] = Item{itemPrice.Contract.Address, itemCount.Contract.Address}

		}

		Logf("Deploying Inventory contract with addresses %+v: \n", itemAddresses)
		inventory, err := wrappers.NewInventoryProvider(alice).Deploy(wrappers.InventoryIninData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy Inventory contract: %v", err)
		Logf("Inventory contract deployed at %s\n", inventory.Contract.Address.String())
		actorRegistry.AddActor(inventory.Contract.Address, uint64(0), "Inventory")

		for index, name := range priceIndex {
			Logf("Sending AddItem request for %s, key: %d, priceAddr: %s, countAddr: %s\n", name, uint8(index), itemAddresses[index].PriceAddr.String(), itemAddresses[index].CountAddr.String())
			_, _, err := inventory.SendAddItem(uint8(index), itemAddresses[index].PriceAddr, itemAddresses[index].CountAddr)
			assert.NoError(t, err, "Failed to send AddItem request: %v", err)
			Logf("AddItem request sent\n")
		}

		Logf("Deploying Storage contract\n")
		storage, err := wrappers.NewStorageProvider(alice).Deploy(wrappers.StorageIninData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy Storage contract: %v", err)
		Logf("Storage contract deployed at %s\n", storage.Contract.Address.String())
		actorRegistry.AddActor(storage.Contract.Address, uint64(0), "Storage")

		Logf("\n\n\n\n\n\nTest Started\n==========================\n")

		for index, name := range priceIndex {
			Logf("Sending GetPrice request for %s\n", name)
			_, _, err = storage.SendGetCapitalFrom(inventory.Contract.Address, uint8(index))
			assert.NoError(t, err, "Failed to send GetPriceFrom request: %v", err)
			Logf("GetPriceFrom request sent\n")

			time.Sleep(time.Second * 10) // Wait for the contract to be deployed
			Logf("Checking result\n")
			result, err := storage.GetValue()
			assert.NoError(t, err, "Failed to get value: %v", err)
			expectedCapital := prices[name] * quantity[name]
			assert.Equal(t, expectedCapital, result, "Expected price %d, got %d", expectedCapital, result)
			Logf("Result: %d\n", result)
		}

		Logf("Test completed successfully\n")
	})
}

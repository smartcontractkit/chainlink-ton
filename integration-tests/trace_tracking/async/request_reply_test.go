package async

import (
	"fmt"
	"math/big"
	"math/rand/v2"

	"testing"

	"integration-tests/trace_tracking/async/wrappers/request_reply"
	"integration-tests/trace_tracking/test_utils"

	"github.com/stretchr/testify/assert"
	"github.com/xssnick/tonutils-go/address"
)

func TestRequestReply(t *testing.T) {
	t.Run("TestRequestReply", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		seeders := test_utils.SetUpTest(t, initialAmount, 1)
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
		itemAddresses := make([]*address.Address, len(priceIndex))

		fmt.Printf("Deploying ItemPrice contracts\n")
		for index, name := range priceIndex {
			fmt.Printf("Deploying ItemPrice %s", name)
			itemPrice, err := request_reply.NewItemPriceProvider(alice).Deploy(request_reply.ItemPriceInitData{ID: (rand.Uint32()), Price: prices[name]})
			assert.NoError(t, err, "Failed to deploy ItemPrice contract: %w", err)
			fmt.Printf("ItemPrice contract deployed at %s\n", itemPrice.Contract.Address.String())
			itemAddresses[index] = itemPrice.Contract.Address
		}

		fmt.Printf("Deploying PriceRegistry contract with addresses %+v: \n", itemAddresses)
		priceRegistry, err := request_reply.NewPriceRegistryProvider(alice).Deploy(request_reply.PriceRegistryInitData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy PriceRegistry contract: %w", err)
		fmt.Printf("PriceRegistry contract deployed at %s\n", priceRegistry.Contract.Address.String())

		for index, name := range priceIndex {
			fmt.Printf("Sending AddPriceItem request for %s, key: %d, addr: %s\n", name, uint8(index), itemAddresses[index].String())
			_, err := priceRegistry.SendAddPriceItem(uint8(index), itemAddresses[index])
			assert.NoError(t, err, "Failed to send AddPriceItem request: %w", err)
			fmt.Printf("AddPriceItem request sent\n")
		}

		fmt.Printf("Deploying Storage contract\n")
		storage, err := request_reply.NewStorageProvider(alice).Deploy(request_reply.StorageInitData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy Storage contract: %w", err)
		fmt.Printf("Storage contract deployed at %s\n", storage.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")

		for index, name := range priceIndex {
			fmt.Printf("Sending GetPrice request for %s\n", name)
			_, err = storage.SendGetPriceFrom(priceRegistry.Contract.Address, uint8(index))
			assert.NoError(t, err, "Failed to send GetPriceFrom request: %w", err)
			fmt.Printf("GetPriceFrom request sent\n")

			fmt.Printf("Checking result\n")
			result, err := storage.GetValue()
			assert.NoError(t, err, "Failed to get value: %w", err)
			expectedPrice := prices[name]
			assert.Equal(t, expectedPrice, result, "Expected price %d, got %d", expectedPrice, result)
			fmt.Printf("Result: %d\n", result)
		}

		fmt.Printf("Test completed successfully\n")
	})
}

package async

import (
	"fmt"
	"math/big"
	"math/rand/v2"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking/tests/async/wrappers/two_msg_chain"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking/tests/test_utils"
	"github.com/stretchr/testify/assert"
)

func TestTwoMsgChain(t *testing.T) {
	t.Run("TestMemoryContract", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		accs := test_utils.SetUpTest(t, initialAmount, 1, bc.Nodes[0].ExternalHTTPUrl)
		alice := accs[0]
		const initValue = uint32(0)
		fmt.Printf("\n\n\n\n\n\nTestStarted\n==========================\n")
		fmt.Printf("Deploying memory contract with initial value %d\n", initValue)
		memoryContract, err := two_msg_chain.NewMemoryProvider(alice).Deploy(two_msg_chain.MemoryInitData{ID: rand.Uint32()})
		assert.NoError(t, err, "Failed to deploy memory contract: %v", err)
		fmt.Printf("Memory contract deployed at %s\n", memoryContract.Contract.Address.String())
		fmt.Printf("Checking if memory contract is deployed\n")
		initValueReturned, err := memoryContract.GetValue()
		assert.NoError(t, err, "Failed to get value: %v", err)
		fmt.Printf("Initial value in memory contract is %d\n", initValueReturned)
		assert.Equal(t, initValue, initValueReturned, "Initial value should be %d", initValue)
		fmt.Printf("Storing value %d in memory contract\n", initValue)
		const valueToStore = uint32(2)
		msgRec, err := memoryContract.SendSetValue(valueToStore)
		assert.NoError(t, err, "Failed to store value: %v", err)
		_ = msgRec
		fmt.Printf("Checking if value is stored in memory contract\n")
		recordedValue, err := memoryContract.GetValue()
		assert.NoError(t, err, "Failed to get value: %v", err)
		assert.Equal(t, valueToStore, recordedValue, "Stored value should be %d", valueToStore)
	})

	t.Run("TestTwoMsgChain", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		accs := test_utils.SetUpTest(t, initialAmount, 1, bc.Nodes[0].ExternalHTTPUrl)
		alice := accs[0]

		const transferAmount = 100
		fmt.Printf("\n\n\n\n\n\nTestStarted\n==========================\n")
		const initValue = uint32(0)
		fmt.Printf("Deploying memory contract with initial value %d\n", initValue)
		memoryContract, err := two_msg_chain.NewMemoryProvider(alice).Deploy(two_msg_chain.MemoryInitData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy memory contract: %v", err)
		fmt.Printf("Memory contract deployed at %s\n", memoryContract.Contract.Address.String())

		fmt.Printf("Deploying storage contract with memory address %s\n", memoryContract.Contract.Address.String())
		storageContract, err := two_msg_chain.NewStorageProvider(alice).Deploy(two_msg_chain.StorageInitData{ID: (rand.Uint32()), MemoryAddress: memoryContract.Contract.Address})
		assert.NoError(t, err, "Failed to deploy storage contract: %v", err)
		fmt.Printf("Storage contract deployed at %s\n", storageContract.Contract.Address.String())

		fmt.Printf("Checking if memory contract is deployed\n")
		initValueReturned, err := memoryContract.GetValue()
		assert.NoError(t, err, "Failed to get value: %v", err)
		fmt.Printf("Initial value in memory contract is %d\n", initValueReturned)
		assert.Equal(t, initValue, initValueReturned, "Initial value should be %d", initValue)

		const valueToStore = uint32(2)
		fmt.Printf("Storing value %d in storage contract\n", valueToStore)
		msgRec, err := storageContract.SendStore(valueToStore)
		assert.NoError(t, err, "Failed to store value: %v", err)
		_ = msgRec

		fmt.Printf("Checking if value is stored in memory contract\n")
		recordedValue, err := memoryContract.GetValue()
		assert.NoError(t, err, "Failed to get value: %v", err)
		assert.Equal(t, valueToStore, recordedValue, "Stored value should be %d", valueToStore)
	})
}

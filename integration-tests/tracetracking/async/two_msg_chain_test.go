package async

import (
	"fmt"
	"math/big"
	"math/rand/v2"
	"testing"

	"integration-tests/tracetracking/async/wrappers/two_msg_chain"
	"integration-tests/tracetracking/test_utils"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTwoMsgChain(t *testing.T) {
	t.Run("TestMemoryContract", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		accs := test_utils.SetUpTest(t, initialAmount, 1)
		alice := accs[0]
		const initValue = uint32(0)
		fmt.Printf("\n\n\n\n\n\nTestStarted\n==========================\n")
		fmt.Printf("Deploying memory contract with initial value %d\n", initValue)
		memoryContract, err := two_msg_chain.NewMemoryProvider(alice).Deploy(two_msg_chain.MemoryInitData{ID: rand.Uint32()})
		require.NoError(t, err, "Failed to deploy memory contract: %w", err)
		fmt.Printf("Memory contract deployed at %s\n", memoryContract.Contract.Address.String())
		fmt.Printf("Checking if memory contract is deployed\n")
		initValueReturned, err := memoryContract.GetValue()
		require.NoError(t, err, "Failed to get value: %w", err)
		fmt.Printf("Initial value in memory contract is %d\n", initValueReturned)
		assert.Equal(t, initValue, initValueReturned, "Initial value should be %d", initValue)
		fmt.Printf("Storing value %d in memory contract\n", initValue)
		const valueToStore = uint32(2)
		msgRec, err := memoryContract.SendSetValue(valueToStore)
		require.NoError(t, err, "Failed to store value: %w", err)
		_ = msgRec
		fmt.Printf("Checking if value is stored in memory contract\n")
		recordedValue, err := memoryContract.GetValue()
		require.NoError(t, err, "Failed to get value: %w", err)
		assert.Equal(t, valueToStore, recordedValue, "Stored value should be %d", valueToStore)
	})

	t.Run("TestTwoMsgChain", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		accs := test_utils.SetUpTest(t, initialAmount, 1)
		alice := accs[0]

		fmt.Printf("\n\n\n\n\n\nTestStarted\n==========================\n")
		const initValue = uint32(0)
		fmt.Printf("Deploying memory contract with initial value %d\n", initValue)
		memoryContract, err := two_msg_chain.NewMemoryProvider(alice).Deploy(two_msg_chain.MemoryInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "Failed to deploy memory contract: %w", err)
		fmt.Printf("Memory contract deployed at %s\n", memoryContract.Contract.Address.String())

		fmt.Printf("Deploying storage contract with memory address %s\n", memoryContract.Contract.Address.String())
		storageContract, err := two_msg_chain.NewStorageProvider(alice).Deploy(two_msg_chain.StorageInitData{ID: (rand.Uint32()), MemoryAddress: memoryContract.Contract.Address})
		require.NoError(t, err, "Failed to deploy storage contract: %w", err)
		fmt.Printf("Storage contract deployed at %s\n", storageContract.Contract.Address.String())

		fmt.Printf("Checking if memory contract is deployed\n")
		initValueReturned, err := memoryContract.GetValue()
		require.NoError(t, err, "Failed to get value: %w", err)
		fmt.Printf("Initial value in memory contract is %d\n", initValueReturned)
		assert.Equal(t, initValue, initValueReturned, "Initial value should be %d", initValue)

		const valueToStore = uint32(2)
		fmt.Printf("Storing value %d in storage contract\n", valueToStore)
		msgRec, err := storageContract.SendStore(valueToStore)
		require.NoError(t, err, "Failed to store value: %w", err)
		_ = msgRec

		fmt.Printf("Checking if value is stored in memory contract\n")
		recordedValue, err := memoryContract.GetValue()
		require.NoError(t, err, "Failed to get value: %w", err)
		assert.Equal(t, valueToStore, recordedValue, "Stored value should be %d", valueToStore)
	})
}

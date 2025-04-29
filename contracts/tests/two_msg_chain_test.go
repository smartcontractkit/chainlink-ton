package experimentation

import (
	"math/rand/v2"
	"testing"

	two_msg_chain "github.com/smartcontractkit/chainlink-ton/contracts/wrappers/examples/two-msg-chain"
	"github.com/stretchr/testify/assert"
)

func TestTwoMsgChain(t *testing.T) {
	t.Run("TestMemoryContract", func(t *testing.T) {
		t.Skip()
		const initialAmmount = 1_000_000_000_000
		accs := setUpTest(t, initialAmmount, 1)
		alice := accs[0]
		const initValue = uint32(0)
		Logf("\n\n\n\n\n\nTestStarted\n==========================\n")
		Logf("Deploying memory contract with initial value %d\n", initValue)
		memoryContract, err := two_msg_chain.NewMemoryProvider(alice).Deploy(two_msg_chain.MemoryIninData{ID: rand.Uint32()})
		assert.NoError(t, err, "Failed to deploy memory contract: %v", err)
		Logf("Memory contract deployed at %s\n", memoryContract.Contract.Address.String())
		Logf("Checking if memory contract is deployed\n")
		initValueReturned, err := memoryContract.GetValue()
		assert.NoError(t, err, "Failed to get value: %v", err)
		Logf("Initial value in memory contract is %d\n", initValueReturned)
		assert.Equal(t, initValue, initValueReturned, "Initial value should be %d", initValue)
		Logf("Storing value %d in memory contract\n", initValue)
		const valueToStore = uint32(2)
		_, msgRec, err := memoryContract.SetValue(valueToStore)
		assert.NoError(t, err, "Failed to store value: %v", err)
		_ = msgRec
		Logf("Checking if value is stored in memory contract\n")
		recordedValue, err := memoryContract.GetValue()
		assert.NoError(t, err, "Failed to get value: %v", err)
		assert.Equal(t, valueToStore, recordedValue, "Stored value should be %d", valueToStore)
	})

	t.Run("TestTwoMsgChain", func(t *testing.T) {
		const initialAmmount = 1_000_000_000_000
		accs := setUpTest(t, initialAmmount, 1)
		alice := accs[0]

		const transferAmount = 100
		Logf("\n\n\n\n\n\nTestStarted\n==========================\n")
		const initValue = uint32(0)
		Logf("Deploying memory contract with initial value %d\n", initValue)
		memoryContract, err := two_msg_chain.NewMemoryProvider(alice).Deploy(two_msg_chain.MemoryIninData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy memory contract: %v", err)
		Logf("Memory contract deployed at %s\n", memoryContract.Contract.Address.String())

		Logf("Deploying storage contract with memory address %s\n", memoryContract.Contract.Address.String())
		storageContract, err := two_msg_chain.NewStorageProvider(alice).Deploy(two_msg_chain.StorageIninData{ID: (rand.Uint32()), MemoryAddress: memoryContract.Contract.Address})
		assert.NoError(t, err, "Failed to deploy storge contract: %v", err)
		Logf("Storage contract deployed at %s\n", storageContract.Contract.Address.String())

		Logf("Checking if memory contract is deployed\n")
		initValueReturned, err := memoryContract.GetValue()
		assert.NoError(t, err, "Failed to get value: %v", err)
		Logf("Initial value in memory contract is %d\n", initValueReturned)
		assert.Equal(t, initValue, initValueReturned, "Initial value should be %d", initValue)

		const valueToStore = uint32(2)
		Logf("Storing value %d in storage contract\n", valueToStore)
		_, msgRec, err := storageContract.Store(valueToStore)
		assert.NoError(t, err, "Failed to store value: %v", err)
		_ = msgRec

		Logf("Checking if value is stored in memory contract\n")
		recordedValue, err := memoryContract.GetValue()
		assert.NoError(t, err, "Failed to get value: %v", err)
		assert.Equal(t, valueToStore, recordedValue, "Stored value should be %d", valueToStore)
	})
}

package async

import (
	"fmt"
	"math/big"
	"math/rand/v2"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/integration-tests/trace_tracking/async/wrappers/two_phase_commit"
	"github.com/smartcontractkit/chainlink-ton/integration-tests/trace_tracking/test_utils"
	"github.com/stretchr/testify/assert"
)

func TestTwoPhaseCommit(t *testing.T) {
	t.Run("AutoAck", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		accs := test_utils.SetUpTest(t, initialAmount, 1)
		alice := accs[0]

		fmt.Printf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := two_phase_commit.NewCounterProvider(alice)
		fmt.Printf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: true})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: true})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBInitData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy DB contract: %v", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txId := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txId)
		assert.NoError(t, err, "Failed to begin transaction: %v", err)
		fmt.Printf("Transaction started with ID %d\n", txId)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		assert.NoError(t, err, "Failed to set value in counter A: %v", err)

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		assert.NoError(t, err, "Failed to set value in counter B: %v", err)

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		assert.NoError(t, err, "Failed to commit transaction: %v", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Test completed successfully\n")
	})

	t.Run("AcksBeforeCommit", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		accs := test_utils.SetUpTest(t, initialAmount, 1)
		alice := accs[0]

		fmt.Printf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := two_phase_commit.NewCounterProvider(alice)
		fmt.Printf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBInitData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy DB contract: %v", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txId := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txId)
		assert.NoError(t, err, "Failed to begin transaction: %v", err)
		fmt.Printf("Transaction started with ID %d\n", txId)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		assert.NoError(t, err, "Failed to set value in counter A: %v", err)

		fmt.Printf("Sending ack to counter A\n")
		_, err = counterA.SendAck()

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		assert.NoError(t, err, "Failed to set value in counter B: %v", err)

		fmt.Printf("Sending ack to counter B\n")
		_, err = counterB.SendAck()

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", initValue, valueA)
		valueB, err := counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		assert.NoError(t, err, "Failed to commit transaction: %v", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Test completed successfully\n")
	})

	t.Run("AcksAfterCommit", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		accs := test_utils.SetUpTest(t, initialAmount, 1)
		alice := accs[0]

		fmt.Printf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := two_phase_commit.NewCounterProvider(alice)
		fmt.Printf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBInitData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy DB contract: %v", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txId := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txId)
		assert.NoError(t, err, "Failed to begin transaction: %v", err)
		fmt.Printf("Transaction started with ID %d\n", txId)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		assert.NoError(t, err, "Failed to set value in counter A: %v", err)

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		assert.NoError(t, err, "Failed to set value in counter B: %v", err)

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		assert.NoError(t, err, "Failed to commit transaction: %v", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Sending ack to counter A\n")
		_, err = counterA.SendAck()

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Sending ack to counter B\n")
		_, err = counterB.SendAck()

		fmt.Printf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Test completed successfully\n")
	})

	t.Run("OneAckAfterCommit", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		accs := test_utils.SetUpTest(t, initialAmount, 1)
		alice := accs[0]

		fmt.Printf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := two_phase_commit.NewCounterProvider(alice)
		fmt.Printf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBInitData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy DB contract: %v", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txId := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txId)
		assert.NoError(t, err, "Failed to begin transaction: %v", err)
		fmt.Printf("Transaction started with ID %d\n", txId)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		assert.NoError(t, err, "Failed to set value in counter A: %v", err)

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		assert.NoError(t, err, "Failed to set value in counter B: %v", err)

		fmt.Printf("Sending ack to counter A\n")
		_, err = counterA.SendAck()

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		assert.NoError(t, err, "Failed to commit transaction: %v", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Sending ack to counter B\n")
		_, err = counterB.SendAck()

		fmt.Printf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Test completed successfully\n")
	})
}

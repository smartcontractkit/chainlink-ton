package async

import (
	"fmt"
	"math/big"
	"math/rand/v2"
	"testing"

	"integration-tests/tracetracking/async/wrappers/two_phase_commit"
	"integration-tests/tracetracking/test_utils"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
		require.NoError(t, err, "Failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: true})
		require.NoError(t, err, "Failed to deploy counter B contract: %w", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "Failed to deploy DB contract: %w", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "Failed to begin transaction: %w", err)
		fmt.Printf("Transaction started with ID %d\n", txID)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "Failed to set value in counter A: %w", err)

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "Failed to set value in counter B: %w", err)

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "Failed to commit transaction: %w", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "Failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "Failed to get value from counter B: %w", err)
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
		require.NoError(t, err, "Failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "Failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "Failed to deploy DB contract: %w", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "Failed to begin transaction: %w", err)
		fmt.Printf("Transaction started with ID %d\n", txID)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "Failed to set value in counter A: %w", err)

		fmt.Printf("Sending ack to counter A\n")
		_, err = counterA.SendAck()

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "Failed to set value in counter B: %w", err)

		fmt.Printf("Sending ack to counter B\n")
		_, err = counterB.SendAck()

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "Failed to get value from counter A: %w", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", initValue, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "Failed to get value from counter B: %w", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "Failed to commit transaction: %w", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		require.NoError(t, err, "Failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		require.NoError(t, err, "Failed to get value from counter B: %w", err)
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
		require.NoError(t, err, "Failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "Failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "Failed to deploy DB contract: %w", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "Failed to begin transaction: %w", err)
		fmt.Printf("Transaction started with ID %d\n", txID)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "Failed to set value in counter A: %w", err)

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "Failed to set value in counter B: %w", err)

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "Failed to commit transaction: %w", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Sending ack to counter A\n")
		_, err = counterA.SendAck()

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "Failed to get value from counter A: %w", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "Failed to get value from counter B: %w", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Sending ack to counter B\n")
		_, err = counterB.SendAck()

		fmt.Printf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		require.NoError(t, err, "Failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		require.NoError(t, err, "Failed to get value from counter B: %w", err)
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
		require.NoError(t, err, "Failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "Failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "Failed to deploy DB contract: %w", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "Failed to begin transaction: %w", err)
		fmt.Printf("Transaction started with ID %d\n", txID)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "Failed to set value in counter A: %w", err)

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "Failed to set value in counter B: %w", err)

		fmt.Printf("Sending ack to counter A\n")
		_, err = counterA.SendAck()

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "Failed to commit transaction: %w", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "Failed to get value from counter A: %w", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "Failed to get value from counter B: %w", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Sending ack to counter B\n")
		_, err = counterB.SendAck()

		fmt.Printf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		require.NoError(t, err, "Failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		require.NoError(t, err, "Failed to get value from counter B: %w", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Test completed successfully\n")
	})
}

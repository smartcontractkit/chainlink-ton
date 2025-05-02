package experimentation

import (
	"math/rand/v2"
	"testing"

	"github.com/smartcontractkit/chainlink-ton/contracts/wrappers/examples/two_phase_commit"
	"github.com/stretchr/testify/assert"
)

func TestTwoPhaseCommit(t *testing.T) {
	t.Run("AutoAck", func(t *testing.T) {
		const initialAmmount = 1_000_000_000_000
		accs := setUpTest(t, initialAmmount, 1)
		alice := accs[0]
		actorRegistry := NewActorRegistry(alice)
		actorRegistry.AddActor(alice.Wallet.WalletAddress(), uint64(0), "Alice")

		Logf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := two_phase_commit.NewCounterProvider(alice)
		Logf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(two_phase_commit.CounterIninData{ID: (rand.Uint32()), Value: initValue, AutoAck: true})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		actorRegistry.AddActor(counterA.Contract.Address, uint64(0), "CounterA")
		Logf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		Logf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterIninData{ID: (rand.Uint32()), Value: initValue, AutoAck: true})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		actorRegistry.AddActor(counterB.Contract.Address, uint64(0), "CounterB")
		Logf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		Logf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBIninData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy DB contract: %v", err)
		actorRegistry.AddActor(dbContract.Contract.Address, uint64(0), "DB")
		Logf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		Logf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		Logf("Beginning transaction\n")
		txID, _, err := dbContract.BeginTransaction()
		assert.NoError(t, err, "Failed to begin transaction: %v", err)
		Logf("Transaction started with ID %d\n", txID)

		Logf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SetValue(counterA.Contract.Address, valueForCounterA)
		assert.NoError(t, err, "Failed to set value in counter A: %v", err)

		Logf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SetValue(counterB.Contract.Address, valueForCounterB)
		assert.NoError(t, err, "Failed to set value in counter B: %v", err)

		Logf("Committing transaction\n")
		_, _, err = dbContract.Commit()
		assert.NoError(t, err, "Failed to commit transaction: %v", err)
		Logf("Transaction committed\n")

		Logf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		Logf("Test completed successfully\n")
	})

	t.Run("AcksBeforeCommit", func(t *testing.T) {
		const initialAmmount = 1_000_000_000_000
		accs := setUpTest(t, initialAmmount, 1)
		alice := accs[0]
		actorRegistry := NewActorRegistry(alice)
		actorRegistry.AddActor(alice.Wallet.WalletAddress(), uint64(0), "Alice")

		Logf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := two_phase_commit.NewCounterProvider(alice)
		Logf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(two_phase_commit.CounterIninData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		actorRegistry.AddActor(counterA.Contract.Address, uint64(0), "CounterA")
		Logf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		Logf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterIninData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		actorRegistry.AddActor(counterB.Contract.Address, uint64(0), "CounterB")
		Logf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		Logf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBIninData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy DB contract: %v", err)
		actorRegistry.AddActor(dbContract.Contract.Address, uint64(0), "DB")
		Logf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		Logf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		Logf("Beginning transaction\n")
		txID, _, err := dbContract.BeginTransaction()
		assert.NoError(t, err, "Failed to begin transaction: %v", err)
		Logf("Transaction started with ID %d\n", txID)

		Logf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SetValue(counterA.Contract.Address, valueForCounterA)
		assert.NoError(t, err, "Failed to set value in counter A: %v", err)

		Logf("Sending ack to counter A\n")
		_, _, err = counterA.SendAck()

		Logf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SetValue(counterB.Contract.Address, valueForCounterB)
		assert.NoError(t, err, "Failed to set value in counter B: %v", err)

		Logf("Sending ack to counter B\n")
		_, _, err = counterB.SendAck()

		Logf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", initValue, valueA)
		valueB, err := counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		Logf("Committing transaction\n")
		_, _, err = dbContract.Commit()
		assert.NoError(t, err, "Failed to commit transaction: %v", err)
		Logf("Transaction committed\n")

		Logf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		Logf("Test completed successfully\n")
	})

	t.Run("AcksAfterCommit", func(t *testing.T) {
		const initialAmmount = 1_000_000_000_000
		accs := setUpTest(t, initialAmmount, 1)
		alice := accs[0]
		actorRegistry := NewActorRegistry(alice)
		actorRegistry.AddActor(alice.Wallet.WalletAddress(), uint64(0), "Alice")

		Logf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := two_phase_commit.NewCounterProvider(alice)
		Logf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(two_phase_commit.CounterIninData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		actorRegistry.AddActor(counterA.Contract.Address, uint64(0), "CounterA")
		Logf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		Logf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterIninData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		actorRegistry.AddActor(counterB.Contract.Address, uint64(0), "CounterB")
		Logf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		Logf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBIninData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy DB contract: %v", err)
		actorRegistry.AddActor(dbContract.Contract.Address, uint64(0), "DB")
		Logf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		Logf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		Logf("Beginning transaction\n")
		txID, _, err := dbContract.BeginTransaction()
		assert.NoError(t, err, "Failed to begin transaction: %v", err)
		Logf("Transaction started with ID %d\n", txID)

		Logf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SetValue(counterA.Contract.Address, valueForCounterA)
		assert.NoError(t, err, "Failed to set value in counter A: %v", err)

		Logf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SetValue(counterB.Contract.Address, valueForCounterB)
		assert.NoError(t, err, "Failed to set value in counter B: %v", err)

		Logf("Committing transaction\n")
		_, _, err = dbContract.Commit()
		assert.NoError(t, err, "Failed to commit transaction: %v", err)
		Logf("Transaction committed\n")

		Logf("Sending ack to counter A\n")
		_, _, err = counterA.SendAck()

		Logf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		Logf("Sending ack to counter B\n")
		_, _, err = counterB.SendAck()

		Logf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		Logf("Test completed successfully\n")
	})

	t.Run("OneAckAfterCommit", func(t *testing.T) {
		const initialAmmount = 1_000_000_000_000
		accs := setUpTest(t, initialAmmount, 1)
		alice := accs[0]
		actorRegistry := NewActorRegistry(alice)
		actorRegistry.AddActor(alice.Wallet.WalletAddress(), uint64(0), "Alice")

		Logf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := two_phase_commit.NewCounterProvider(alice)
		Logf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(two_phase_commit.CounterIninData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		actorRegistry.AddActor(counterA.Contract.Address, uint64(0), "CounterA")
		Logf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		Logf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(two_phase_commit.CounterIninData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		assert.NoError(t, err, "Failed to deploy counter A contract: %v", err)
		actorRegistry.AddActor(counterB.Contract.Address, uint64(0), "CounterB")
		Logf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		Logf("Deploying DB contract\n")
		dbContract, err := two_phase_commit.NewDBProvider(alice).Deploy(two_phase_commit.DBIninData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy DB contract: %v", err)
		actorRegistry.AddActor(dbContract.Contract.Address, uint64(0), "DB")
		Logf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		Logf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		Logf("Beginning transaction\n")
		txID, _, err := dbContract.BeginTransaction()
		assert.NoError(t, err, "Failed to begin transaction: %v", err)
		Logf("Transaction started with ID %d\n", txID)

		Logf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SetValue(counterA.Contract.Address, valueForCounterA)
		assert.NoError(t, err, "Failed to set value in counter A: %v", err)

		Logf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SetValue(counterB.Contract.Address, valueForCounterB)
		assert.NoError(t, err, "Failed to set value in counter B: %v", err)

		Logf("Sending ack to counter A\n")
		_, _, err = counterA.SendAck()

		Logf("Committing transaction\n")
		_, _, err = dbContract.Commit()
		assert.NoError(t, err, "Failed to commit transaction: %v", err)
		Logf("Transaction committed\n")

		Logf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		Logf("Sending ack to counter B\n")
		_, _, err = counterB.SendAck()

		Logf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		assert.NoError(t, err, "Failed to get value from counter A: %v", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		assert.NoError(t, err, "Failed to get value from counter B: %v", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		Logf("Test completed successfully\n")
	})
}

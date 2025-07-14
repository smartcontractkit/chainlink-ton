package tracetracking

import (
	"context"
	"fmt"
	"math/big"
	"math/rand/v2"
	"testing"

	"integration-tests/tracetracking/async/wrappers/requestreply"
	"integration-tests/tracetracking/async/wrappers/requestreplywithtwodependencies"
	"integration-tests/tracetracking/async/wrappers/twomsgchain"
	"integration-tests/tracetracking/async/wrappers/twophasecommit"
	counter "integration-tests/tracetracking/counter/wrappers"
	"integration-tests/tracetracking/testutils"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

func TestIntegration(t *testing.T) {
	var initialAmount = big.NewInt(1_000_000_000_000)
	newWallet := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 2)
	t.Run("TestDepositFees", func(t *testing.T) {
		alice := newWallet()
		bob := newWallet()

		var transferAmount = big.NewInt(100)
		fmt.Printf("\n\n\n\n\n\nTestStarted\n==========================\n")
		transfer, err := alice.Wallet.BuildTransfer(bob.Wallet.WalletAddress(), tlb.FromNanoTON(transferAmount), false, "deposit")
		require.NoError(t, err, "failed to build transfer: %w", err)
		externalMessageReceived, _, err := alice.SendWaitTransaction(context.TODO(), *bob.Wallet.WalletAddress(), transfer)
		require.NoError(t, err, "failed to send transaction: %w", err)
		fmt.Printf("\n==========================\nreceivedMessage: %+v\n==========================\n", externalMessageReceived)
		rerr := externalMessageReceived.WaitForTrace(&bob)
		require.NoError(t, rerr, "failed to wait for trace: %w", rerr)
		fmt.Printf("Transaction finalized\n")
		fmt.Printf("\n==========================\nFinalized msg: %+v\n==========================\n", externalMessageReceived)

		aliceBalance := testutils.MustGetBalance(t, alice)
		testutils.VerifyTransaction(t, externalMessageReceived, initialAmount, big.NewInt(0).Neg(transferAmount), aliceBalance)

		internalMessagedReceivedByBob := externalMessageReceived.OutgoingInternalReceivedMessages[0]
		require.NotNil(t, internalMessagedReceivedByBob, "Internal message not received by Bob")
		bobBalance := testutils.MustGetBalance(t, bob)
		testutils.VerifyTransaction(t, internalMessagedReceivedByBob, initialAmount, transferAmount, bobBalance)
	})

	t.Run("TestCounter", func(t *testing.T) {
		t.Skip("mylocalton doesn't work with tolk 1.0 yet")
		alice := newWallet()

		fmt.Printf("\n\n\n\n\n\nTest Setup\n==========================\n")

		fmt.Printf("Deploying Counter contract\n")
		counter, err := counter.NewCounterProvider(alice).Deploy(counter.CounterInitData{ID: (rand.Uint32()), Value: 100})
		require.NoError(t, err, "failed to deploy Counter contract: %w", err)
		fmt.Printf("Counter contract deployed at %s\n", counter.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")

		fmt.Printf("Checking initial value\n")
		result, err := counter.GetValue()
		require.NoError(t, err, "failed to get initial value: %w", err)
		expectedValue := uint32(100)
		require.Equal(t, expectedValue, result, "Expected initial value %d, got %d", expectedValue, result)
		fmt.Printf("Initial value: %d\n", result)

		fmt.Printf("Sending SetCount request\n")
		msgReceived, err := counter.SendSetCount(1)
		require.NoError(t, err, "failed to send SetCount request: %w", err)
		require.Equal(t, tvm.ExitCodeSuccess, msgReceived.ExitCode, "Expected exit code 0, got %d", msgReceived.ExitCode)
		outgoingCount := len(msgReceived.OutgoingInternalReceivedMessages)
		require.Equal(t, 1, outgoingCount, "Expected 1 outgoing internal received message, got %d", outgoingCount)
		internalExitCode := msgReceived.OutgoingInternalReceivedMessages[0].ExitCode
		require.Equal(t, tvm.ExitCodeSuccess, internalExitCode, "Expected exit code 0, got %d", internalExitCode)
		fmt.Printf("msgReceived: %+v\n", msgReceived)
		fmt.Printf("SetCount request sent\n")

		fmt.Printf("Checking result\n")
		result, err = counter.GetValue()
		require.NoError(t, err, "failed to get value: %w", err)
		expectedValue = uint32(1)
		require.Equal(t, expectedValue, result, "Expected value %d, got %d", expectedValue, result)
		fmt.Printf("Result: %d\n", result)

		fmt.Printf("Test completed successfully\n")
	})

	t.Run("TestRequestReply", func(t *testing.T) {
		alice := newWallet()

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
			itemPrice, err := requestreply.NewItemPriceProvider(alice).Deploy(requestreply.ItemPriceInitData{ID: (rand.Uint32()), Price: prices[name]})
			require.NoError(t, err, "failed to deploy ItemPrice contract: %w", err)
			fmt.Printf("ItemPrice contract deployed at %s\n", itemPrice.Contract.Address.String())
			itemAddresses[index] = itemPrice.Contract.Address
		}

		fmt.Printf("Deploying PriceRegistry contract with addresses %+v: \n", itemAddresses)
		priceRegistry, err := requestreply.NewPriceRegistryProvider(alice).Deploy(requestreply.PriceRegistryInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy PriceRegistry contract: %w", err)
		fmt.Printf("PriceRegistry contract deployed at %s\n", priceRegistry.Contract.Address.String())

		for index, name := range priceIndex {
			fmt.Printf("Sending AddPriceItem request for %s, key: %d, addr: %s\n", name, index, itemAddresses[index].String())
			_, serr := priceRegistry.SendAddPriceItem(uint8(index), itemAddresses[index]) //nolint:gosec // testing purpose
			require.NoError(t, serr, "failed to send AddPriceItem request: %w", serr)
			fmt.Printf("AddPriceItem request sent\n")
		}

		fmt.Printf("Deploying Storage contract\n")
		storage, err := requestreply.NewStorageProvider(alice).Deploy(requestreply.StorageInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy Storage contract: %w", err)
		fmt.Printf("Storage contract deployed at %s\n", storage.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")

		for index, name := range priceIndex {
			fmt.Printf("Sending GetPrice request for %s\n", name)
			_, err = storage.SendGetPriceFrom(priceRegistry.Contract.Address, uint8(index)) //nolint:gosec // testing purpose
			require.NoError(t, err, "failed to send GetPriceFrom request: %w", err)
			fmt.Printf("GetPriceFrom request sent\n")

			fmt.Printf("Checking result\n")
			result, err := storage.GetValue()
			require.NoError(t, err, "failed to get value: %w", err)
			expectedPrice := prices[name]
			assert.Equal(t, expectedPrice, result, "Expected price %d, got %d", expectedPrice, result)
			fmt.Printf("Result: %d\n", result)
		}

		fmt.Printf("Test completed successfully\n")
	})

	type Item struct {
		PriceAddr *address.Address
		CountAddr *address.Address
	}

	t.Run("TestRequestReplyWithTwoDependencies", func(t *testing.T) {
		alice := newWallet()

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

	t.Run("TestMemoryContract", func(t *testing.T) {
		alice := newWallet()
		const initValue = uint32(0)
		fmt.Printf("\n\n\n\n\n\nTestStarted\n==========================\n")
		fmt.Printf("Deploying memory contract with initial value %d\n", initValue)
		memoryContract, err := twomsgchain.NewMemoryProvider(alice).Deploy(twomsgchain.MemoryInitData{ID: rand.Uint32()})
		require.NoError(t, err, "failed to deploy memory contract: %w", err)
		fmt.Printf("Memory contract deployed at %s\n", memoryContract.Contract.Address.String())
		fmt.Printf("Checking if memory contract is deployed\n")
		initValueReturned, err := memoryContract.GetValue()
		require.NoError(t, err, "failed to get value: %w", err)
		fmt.Printf("Initial value in memory contract is %d\n", initValueReturned)
		assert.Equal(t, initValue, initValueReturned, "Initial value should be %d", initValue)
		fmt.Printf("Storing value %d in memory contract\n", initValue)
		const valueToStore = uint32(2)
		msgRec, err := memoryContract.SendSetValue(valueToStore)
		require.NoError(t, err, "failed to store value: %w", err)
		_ = msgRec
		fmt.Printf("Checking if value is stored in memory contract\n")
		recordedValue, err := memoryContract.GetValue()
		require.NoError(t, err, "failed to get value: %w", err)
		assert.Equal(t, valueToStore, recordedValue, "Stored value should be %d", valueToStore)
	})

	t.Run("TestTwoMsgChain", func(t *testing.T) {
		alice := newWallet()
		fmt.Printf("\n\n\n\n\n\nTestStarted\n==========================\n")
		const initValue = uint32(0)
		fmt.Printf("Deploying memory contract with initial value %d\n", initValue)
		memoryContract, err := twomsgchain.NewMemoryProvider(alice).Deploy(twomsgchain.MemoryInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy memory contract: %w", err)
		fmt.Printf("Memory contract deployed at %s\n", memoryContract.Contract.Address.String())

		fmt.Printf("Deploying storage contract with memory address %s\n", memoryContract.Contract.Address.String())
		storageContract, err := twomsgchain.NewStorageProvider(alice).Deploy(twomsgchain.StorageInitData{ID: (rand.Uint32()), MemoryAddress: memoryContract.Contract.Address})
		require.NoError(t, err, "failed to deploy storage contract: %w", err)
		fmt.Printf("Storage contract deployed at %s\n", storageContract.Contract.Address.String())

		fmt.Printf("Checking if memory contract is deployed\n")
		initValueReturned, err := memoryContract.GetValue()
		require.NoError(t, err, "failed to get value: %w", err)
		fmt.Printf("Initial value in memory contract is %d\n", initValueReturned)
		assert.Equal(t, initValue, initValueReturned, "Initial value should be %d", initValue)

		const valueToStore = uint32(2)
		fmt.Printf("Storing value %d in storage contract\n", valueToStore)
		msgRec, err := storageContract.SendStore(valueToStore)
		require.NoError(t, err, "failed to store value: %w", err)
		_ = msgRec

		fmt.Printf("Checking if value is stored in memory contract\n")
		recordedValue, err := memoryContract.GetValue()
		require.NoError(t, err, "failed to get value: %w", err)
		assert.Equal(t, valueToStore, recordedValue, "Stored value should be %d", valueToStore)
	})

	t.Run("AutoAck", func(t *testing.T) {
		alice := newWallet()

		fmt.Printf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := twophasecommit.NewCounterProvider(alice)
		fmt.Printf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: true})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: true})
		require.NoError(t, err, "failed to deploy counter B contract: %w", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := twophasecommit.NewDBProvider(alice).Deploy(twophasecommit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy DB contract: %w", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "failed to begin transaction: %w", err)
		fmt.Printf("Transaction started with ID %d\n", txID)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "failed to set value in counter A: %w", err)

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "failed to set value in counter B: %w", err)

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "failed to commit transaction: %w", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Test completed successfully\n")
	})

	t.Run("AcksBeforeCommit", func(t *testing.T) {
		alice := newWallet()

		fmt.Printf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := twophasecommit.NewCounterProvider(alice)
		fmt.Printf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := twophasecommit.NewDBProvider(alice).Deploy(twophasecommit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy DB contract: %w", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "failed to begin transaction: %w", err)
		fmt.Printf("Transaction started with ID %d\n", txID)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "failed to set value in counter A: %w", err)

		fmt.Printf("Sending ack to counter A\n")
		_, err = counterA.SendAck()
		require.NoError(t, err, "failed to send ack to counter A: %w", err)

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "failed to set value in counter B: %w", err)

		fmt.Printf("Sending ack to counter B\n")
		_, err = counterB.SendAck()
		require.NoError(t, err, "failed to send ack to counter B: %w", err)

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", initValue, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "failed to commit transaction: %w", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Test completed successfully\n")
	})

	t.Run("AcksAfterCommit", func(t *testing.T) {
		alice := newWallet()

		fmt.Printf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := twophasecommit.NewCounterProvider(alice)
		fmt.Printf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := twophasecommit.NewDBProvider(alice).Deploy(twophasecommit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy DB contract: %w", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "failed to begin transaction: %w", err)
		fmt.Printf("Transaction started with ID %d\n", txID)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "failed to set value in counter A: %w", err)

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "failed to set value in counter B: %w", err)

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "failed to commit transaction: %w", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Sending ack to counter A\n")
		_, err = counterA.SendAck()
		require.NoError(t, err, "failed to send ack to counter A: %w", err)

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Sending ack to counter B\n")
		_, err = counterB.SendAck()
		require.NoError(t, err, "failed to send ack to counter B: %w", err)

		fmt.Printf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Test completed successfully\n")
	})

	t.Run("OneAckAfterCommit", func(t *testing.T) {
		alice := newWallet()

		fmt.Printf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := twophasecommit.NewCounterProvider(alice)
		fmt.Printf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		fmt.Printf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		fmt.Printf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		fmt.Printf("Deploying DB contract\n")
		dbContract, err := twophasecommit.NewDBProvider(alice).Deploy(twophasecommit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy DB contract: %w", err)
		fmt.Printf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		fmt.Printf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "failed to begin transaction: %w", err)
		fmt.Printf("Transaction started with ID %d\n", txID)

		fmt.Printf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "failed to set value in counter A: %w", err)

		fmt.Printf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "failed to set value in counter B: %w", err)

		fmt.Printf("Sending ack to counter A\n")
		_, err = counterA.SendAck()
		require.NoError(t, err, "failed to send ack to counter A: %w", err)

		fmt.Printf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "failed to commit transaction: %w", err)
		fmt.Printf("Transaction committed\n")

		fmt.Printf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Sending ack to counter B\n")
		_, err = counterB.SendAck()
		require.NoError(t, err, "failed to send ack to counter B: %w", err)

		fmt.Printf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		fmt.Printf("Test completed successfully\n")
	})
}

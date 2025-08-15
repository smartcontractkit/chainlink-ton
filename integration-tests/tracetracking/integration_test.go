package tracetracking

import (
	"math/big"
	"math/rand/v2"
	"testing"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"integration-tests/tracetracking/async/wrappers/requestreply"
	"integration-tests/tracetracking/async/wrappers/requestreplywithtwodependencies"
	"integration-tests/tracetracking/async/wrappers/twomsgchain"
	"integration-tests/tracetracking/async/wrappers/twophasecommit"

	"integration-tests/tracetracking/testutils"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/examples/counter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

func TestIntegration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping long-running test in short mode")
	}

	var initialAmount = big.NewInt(1_000_000_000_000)
	accs := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 2)
	t.Run("TestDepositFees", func(t *testing.T) {
		alice := accs[0]
		bob := accs[1]

		var transferAmount = big.NewInt(100)
		t.Logf("\n\n\n\n\n\nTestStarted\n==========================\n")
		transfer, err := alice.Wallet.BuildTransfer(bob.Wallet.WalletAddress(), tlb.FromNanoTON(transferAmount), false, "deposit")
		require.NoError(t, err, "failed to build transfer: %w", err)
		externalMessageReceived, _, err := alice.SendWaitTransaction(t.Context(), *bob.Wallet.WalletAddress(), transfer)
		require.NoError(t, err, "failed to send transaction: %w", err)
		t.Logf("\n==========================\nreceivedMessage: %+v\n==========================\n", externalMessageReceived)
		rerr := externalMessageReceived.WaitForTrace(bob.Client)
		require.NoError(t, rerr, "failed to wait for trace: %w", rerr)
		t.Logf("Transaction finalized\n")
		t.Logf("\n==========================\nFinalized msg: %+v\n==========================\n", externalMessageReceived)

		aliceBalance := testutils.MustGetBalance(t, alice)
		testutils.VerifyTransaction(t, externalMessageReceived, initialAmount, big.NewInt(0).Neg(transferAmount), aliceBalance)

		internalMessagedReceivedByBob := externalMessageReceived.OutgoingInternalReceivedMessages[0]
		require.NotNil(t, internalMessagedReceivedByBob, "Internal message not received by Bob")
		bobBalance := testutils.MustGetBalance(t, bob)
		testutils.VerifyTransaction(t, internalMessagedReceivedByBob, initialAmount, transferAmount, bobBalance)
	})

	t.Run("TestCounter", func(t *testing.T) {
		alice := accs[0]

		t.Logf("\n\n\n\n\n\nTest Setup\n==========================\n")

		t.Logf("Deploying Counter contract\n")
		data := counter.ContractData{
			ID:    rand.Uint32(),
			Value: 100,
			Ownable: common.Ownable2Step{
				Owner:        alice.Wallet.WalletAddress(),
				PendingOwner: nil,
			},
		}
		dataCell, err := tlb.ToCell(data)
		require.NoError(t, err)

		path := bindings.GetBuildDir("examples.Counter.compiled.json")
		code, err := wrappers.ParseCompiledContract(path)
		require.NoError(t, err)

		body := cell.BeginCell().EndCell()
		counterContract, _, err := wrappers.Deploy(&alice, code, dataCell, tlb.MustFromTON("0.05"), body)
		require.NoError(t, err, "failed to deploy Counter contract: %w", err)

		t.Logf("Counter contract deployed at %s\n", counterContract.Address.String())

		t.Logf("\n\n\n\n\n\nTest Started\n==========================\n")

		t.Logf("Checking initial value\n")
		result, err := counter.GetValue(t.Context(), alice.Client, counterContract.Address)
		require.NoError(t, err, "failed to get initial value: %w", err)
		expectedValue := uint32(100)
		require.Equal(t, expectedValue, result, "Expected initial value %d, got %d", expectedValue, result)
		t.Logf("Initial value: %d\n", result)

		t.Logf("Sending SetCount request\n")
		msg := counter.SetCount{
			QueryID:  rand.Uint64(),
			NewCount: 1,
		}
		msgReceived, err := counterContract.CallWaitRecursively(msg, tlb.MustFromTON("0.5"))
		require.NoError(t, err, "failed to send SetCount request: %w", err)

		require.Equal(t, tvm.ExitCodeSuccess, msgReceived.ExitCode, "Expected exit code 0, got %d", msgReceived.ExitCode)
		outgoingCount := len(msgReceived.OutgoingInternalReceivedMessages)
		require.Equal(t, 1, outgoingCount, "Expected 1 outgoing internal received message, got %d", outgoingCount)
		internalExitCode := msgReceived.OutgoingInternalReceivedMessages[0].ExitCode
		require.Equal(t, tvm.ExitCodeSuccess, internalExitCode, "Expected exit code 0, got %d", internalExitCode)
		t.Logf("msgReceived: %+v\n", msgReceived)
		t.Logf("SetCount request sent\n")

		t.Logf("Checking result\n")
		result, err = counter.GetValue(t.Context(), alice.Client, counterContract.Address)
		require.NoError(t, err, "failed to get value: %w", err)
		expectedValue = uint32(1)
		require.Equal(t, expectedValue, result, "Expected value %d, got %d", expectedValue, result)
		t.Logf("Result: %d\n", result)

		t.Logf("Test completed successfully\n")
	})

	t.Run("TestRequestReply", func(t *testing.T) {
		alice := accs[0]

		t.Logf("\n\n\n\n\n\nTest Setup\n==========================\n")

		priceIndex := []string{
			"apple",
			"banana",
		}
		prices := map[string]uint64{
			"apple":  100,
			"banana": 200,
		}
		itemAddresses := make([]*address.Address, len(priceIndex))

		t.Logf("Deploying ItemPrice contracts\n")
		for index, name := range priceIndex {
			t.Logf("Deploying ItemPrice %s", name)
			itemPrice, err := requestreply.NewItemPriceProvider(alice).Deploy(requestreply.ItemPriceInitData{ID: (rand.Uint32()), Price: prices[name]})
			require.NoError(t, err, "failed to deploy ItemPrice contract: %w", err)
			t.Logf("ItemPrice contract deployed at %s\n", itemPrice.Contract.Address.String())
			itemAddresses[index] = itemPrice.Contract.Address
		}

		t.Logf("Deploying PriceRegistry contract with addresses %+v: \n", itemAddresses)
		priceRegistry, err := requestreply.NewPriceRegistryProvider(alice).Deploy(requestreply.PriceRegistryInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy PriceRegistry contract: %w", err)
		t.Logf("PriceRegistry contract deployed at %s\n", priceRegistry.Contract.Address.String())

		for index, name := range priceIndex {
			t.Logf("Sending AddPriceItem request for %s, key: %d, addr: %s\n", name, index, itemAddresses[index].String())
			_, serr := priceRegistry.SendAddPriceItem(uint8(index), itemAddresses[index]) //nolint:gosec // testing purpose
			require.NoError(t, serr, "failed to send AddPriceItem request: %w", serr)
			t.Logf("AddPriceItem request sent\n")
		}

		t.Logf("Deploying Storage contract\n")
		storage, err := requestreply.NewStorageProvider(alice).Deploy(requestreply.StorageInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy Storage contract: %w", err)
		t.Logf("Storage contract deployed at %s\n", storage.Contract.Address.String())

		t.Logf("\n\n\n\n\n\nTest Started\n==========================\n")

		for index, name := range priceIndex {
			t.Logf("Sending GetPrice request for %s\n", name)
			_, err = storage.SendGetPriceFrom(priceRegistry.Contract.Address, uint8(index)) //nolint:gosec // testing purpose
			require.NoError(t, err, "failed to send GetPriceFrom request: %w", err)
			t.Logf("GetPriceFrom request sent\n")

			t.Logf("Checking result\n")
			result, err := storage.GetValue()
			require.NoError(t, err, "failed to get value: %w", err)
			expectedPrice := prices[name]
			assert.Equal(t, expectedPrice, result, "Expected price %d, got %d", expectedPrice, result)
			t.Logf("Result: %d\n", result)
		}

		t.Logf("Test completed successfully\n")
	})

	type Item struct {
		PriceAddr *address.Address
		CountAddr *address.Address
	}

	t.Run("TestRequestReplyWithTwoDependencies", func(t *testing.T) {
		alice := accs[0]

		t.Logf("\n\n\n\n\n\nTest Setup\n==========================\n")

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

		t.Logf("Deploying ItemPrice and ItemCount contracts\n")
		for index, name := range priceIndex {
			t.Logf("Deploying ItemPrice %s", name)
			itemPrice, err := requestreplywithtwodependencies.NewItemPriceProvider(alice).Deploy(requestreplywithtwodependencies.ItemPriceInitData{ID: (rand.Uint32()), Price: prices[name]})
			require.NoError(t, err, "failed to deploy ItemPrice contract: %w", err)
			t.Logf("ItemPrice contract deployed at %s\n", itemPrice.Contract.Address.String())

			t.Logf("Deploying ItemCount %s", name)
			itemCount, err := requestreplywithtwodependencies.NewItemCountProvider(alice).Deploy(requestreplywithtwodependencies.ItemCountInitData{ID: (rand.Uint32()), Count: quantity[name]})
			require.NoError(t, err, "failed to deploy ItemCount contract: %w", err)
			t.Logf("ItemCount contract deployed at %s\n", itemCount.Contract.Address.String())

			itemAddresses[index] = Item{itemPrice.Contract.Address, itemCount.Contract.Address}
		}

		t.Logf("Deploying Inventory contract with addresses %+v: \n", itemAddresses)
		inventory, err := requestreplywithtwodependencies.NewInventoryProvider(alice).Deploy(requestreplywithtwodependencies.InventoryInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy Inventory contract: %w", err)
		t.Logf("Inventory contract deployed at %s\n", inventory.Contract.Address.String())

		for index, name := range priceIndex {
			t.Logf("Sending AddItem request for %s, key: %d, priceAddr: %s, countAddr: %s\n", name, index, itemAddresses[index].PriceAddr.String(), itemAddresses[index].CountAddr.String())
			_, serr := inventory.SendAddItem(uint8(index), itemAddresses[index].PriceAddr, itemAddresses[index].CountAddr) //nolint:gosec // testing purpose
			require.NoError(t, serr, "failed to send AddItem request: %w", serr)
			t.Logf("AddItem request sent\n")
		}

		t.Logf("Deploying Storage contract\n")
		storage, err := requestreplywithtwodependencies.NewStorageProvider(alice).Deploy(requestreplywithtwodependencies.StorageInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy Storage contract: %w", err)
		t.Logf("Storage contract deployed at %s\n", storage.Contract.Address.String())

		t.Logf("\n\n\n\n\n\nTest Started\n==========================\n")

		for index, name := range priceIndex {
			t.Logf("Sending GetCapitalFrom request for %s\n", name)
			_, err = storage.SendGetCapitalFrom(inventory.Contract.Address, uint8(index)) //nolint:gosec // testing purpose
			require.NoError(t, err, "failed to send GetCapitalFrom request: %w", err)
			t.Logf("GetCapitalFrom request sent\n")

			t.Logf("Checking result\n")
			result, err := storage.GetValue()
			require.NoError(t, err, "failed to get value: %w", err)
			expectedCapital := prices[name] * quantity[name]
			assert.Equal(t, expectedCapital, result, "Expected capital %d, got %d", expectedCapital, result)
			t.Logf("Result: %d\n", result)
		}

		t.Logf("Test completed successfully\n")
	})

	t.Run("TestMemoryContract", func(t *testing.T) {
		alice := accs[0]
		const initValue = uint32(0)
		t.Logf("\n\n\n\n\n\nTestStarted\n==========================\n")
		t.Logf("Deploying memory contract with initial value %d\n", initValue)
		memoryContract, err := twomsgchain.NewMemoryProvider(alice).Deploy(twomsgchain.MemoryInitData{ID: rand.Uint32()})
		require.NoError(t, err, "failed to deploy memory contract: %w", err)
		t.Logf("Memory contract deployed at %s\n", memoryContract.Contract.Address.String())
		t.Logf("Checking if memory contract is deployed\n")
		initValueReturned, err := memoryContract.GetValue()
		require.NoError(t, err, "failed to get value: %w", err)
		t.Logf("Initial value in memory contract is %d\n", initValueReturned)
		assert.Equal(t, initValue, initValueReturned, "Initial value should be %d", initValue)
		t.Logf("Storing value %d in memory contract\n", initValue)
		const valueToStore = uint32(2)
		msgRec, err := memoryContract.SendSetValue(valueToStore)
		require.NoError(t, err, "failed to store value: %w", err)
		_ = msgRec
		t.Logf("Checking if value is stored in memory contract\n")
		recordedValue, err := memoryContract.GetValue()
		require.NoError(t, err, "failed to get value: %w", err)
		assert.Equal(t, valueToStore, recordedValue, "Stored value should be %d", valueToStore)
	})

	t.Run("TestTwoMsgChain", func(t *testing.T) {
		alice := accs[0]
		t.Logf("\n\n\n\n\n\nTestStarted\n==========================\n")
		const initValue = uint32(0)
		t.Logf("Deploying memory contract with initial value %d\n", initValue)
		memoryContract, err := twomsgchain.NewMemoryProvider(alice).Deploy(twomsgchain.MemoryInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy memory contract: %w", err)
		t.Logf("Memory contract deployed at %s\n", memoryContract.Contract.Address.String())

		t.Logf("Deploying storage contract with memory address %s\n", memoryContract.Contract.Address.String())
		storageContract, err := twomsgchain.NewStorageProvider(alice).Deploy(twomsgchain.StorageInitData{ID: (rand.Uint32()), MemoryAddress: memoryContract.Contract.Address})
		require.NoError(t, err, "failed to deploy storage contract: %w", err)
		t.Logf("Storage contract deployed at %s\n", storageContract.Contract.Address.String())

		t.Logf("Checking if memory contract is deployed\n")
		initValueReturned, err := memoryContract.GetValue()
		require.NoError(t, err, "failed to get value: %w", err)
		t.Logf("Initial value in memory contract is %d\n", initValueReturned)
		assert.Equal(t, initValue, initValueReturned, "Initial value should be %d", initValue)

		const valueToStore = uint32(2)
		t.Logf("Storing value %d in storage contract\n", valueToStore)
		msgRec, err := storageContract.SendStore(valueToStore)
		require.NoError(t, err, "failed to store value: %w", err)
		_ = msgRec

		t.Logf("Checking if value is stored in memory contract\n")
		recordedValue, err := memoryContract.GetValue()
		require.NoError(t, err, "failed to get value: %w", err)
		assert.Equal(t, valueToStore, recordedValue, "Stored value should be %d", valueToStore)
	})

	t.Run("AutoAck", func(t *testing.T) {
		alice := accs[0]

		t.Logf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := twophasecommit.NewCounterProvider(alice)
		t.Logf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: true})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		t.Logf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		t.Logf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: true})
		require.NoError(t, err, "failed to deploy counter B contract: %w", err)
		t.Logf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		t.Logf("Deploying DB contract\n")
		dbContract, err := twophasecommit.NewDBProvider(alice).Deploy(twophasecommit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy DB contract: %w", err)
		t.Logf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		t.Logf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		t.Logf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "failed to begin transaction: %w", err)
		t.Logf("Transaction started with ID %d\n", txID)

		t.Logf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "failed to set value in counter A: %w", err)

		t.Logf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "failed to set value in counter B: %w", err)

		t.Logf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "failed to commit transaction: %w", err)
		t.Logf("Transaction committed\n")

		t.Logf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		t.Logf("Test completed successfully\n")
	})

	t.Run("AcksBeforeCommit", func(t *testing.T) {
		alice := accs[0]

		t.Logf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := twophasecommit.NewCounterProvider(alice)
		t.Logf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		t.Logf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		t.Logf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		t.Logf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		t.Logf("Deploying DB contract\n")
		dbContract, err := twophasecommit.NewDBProvider(alice).Deploy(twophasecommit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy DB contract: %w", err)
		t.Logf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		t.Logf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		t.Logf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "failed to begin transaction: %w", err)
		t.Logf("Transaction started with ID %d\n", txID)

		t.Logf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "failed to set value in counter A: %w", err)

		t.Logf("Sending ack to counter A\n")
		_, err = counterA.SendAck()
		require.NoError(t, err, "failed to send ack to counter A: %w", err)

		t.Logf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "failed to set value in counter B: %w", err)

		t.Logf("Sending ack to counter B\n")
		_, err = counterB.SendAck()
		require.NoError(t, err, "failed to send ack to counter B: %w", err)

		t.Logf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", initValue, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		t.Logf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "failed to commit transaction: %w", err)
		t.Logf("Transaction committed\n")

		t.Logf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		t.Logf("Test completed successfully\n")
	})

	t.Run("AcksAfterCommit", func(t *testing.T) {
		alice := accs[0]

		t.Logf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := twophasecommit.NewCounterProvider(alice)
		t.Logf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		t.Logf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		t.Logf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		t.Logf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		t.Logf("Deploying DB contract\n")
		dbContract, err := twophasecommit.NewDBProvider(alice).Deploy(twophasecommit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy DB contract: %w", err)
		t.Logf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		t.Logf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		t.Logf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "failed to begin transaction: %w", err)
		t.Logf("Transaction started with ID %d\n", txID)

		t.Logf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "failed to set value in counter A: %w", err)

		t.Logf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "failed to set value in counter B: %w", err)

		t.Logf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "failed to commit transaction: %w", err)
		t.Logf("Transaction committed\n")

		t.Logf("Sending ack to counter A\n")
		_, err = counterA.SendAck()
		require.NoError(t, err, "failed to send ack to counter A: %w", err)

		t.Logf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		t.Logf("Sending ack to counter B\n")
		_, err = counterB.SendAck()
		require.NoError(t, err, "failed to send ack to counter B: %w", err)

		t.Logf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		t.Logf("Test completed successfully\n")
	})

	t.Run("OneAckAfterCommit", func(t *testing.T) {
		alice := accs[0]

		t.Logf("\n\n\n\n\n\nTest Setup\n==========================\n")
		const initValue = uint32(0)
		counterProvider := twophasecommit.NewCounterProvider(alice)
		t.Logf("Deploying counter A with initial value %d\n", initValue)
		counterA, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		t.Logf("Counter A deployed at %s\n", counterA.Contract.Address.String())

		t.Logf("Deploying counter B with initial value %d\n", initValue)
		counterB, err := counterProvider.Deploy(twophasecommit.CounterInitData{ID: (rand.Uint32()), Value: initValue, AutoAck: false})
		require.NoError(t, err, "failed to deploy counter A contract: %w", err)
		t.Logf("Counter B deployed at %s\n", counterB.Contract.Address.String())

		t.Logf("Deploying DB contract\n")
		dbContract, err := twophasecommit.NewDBProvider(alice).Deploy(twophasecommit.DBInitData{ID: (rand.Uint32())})
		require.NoError(t, err, "failed to deploy DB contract: %w", err)
		t.Logf("DB contract deployed at %s\n", dbContract.Contract.Address.String())

		t.Logf("\n\n\n\n\n\nTest Started\n==========================\n")
		const valueForCounterA = uint32(1)
		const valueForCounterB = uint32(2)

		t.Logf("Beginning transaction\n")
		txID := rand.Uint64()
		_, err = dbContract.SendBeginTransaction(txID)
		require.NoError(t, err, "failed to begin transaction: %w", err)
		t.Logf("Transaction started with ID %d\n", txID)

		t.Logf("Setting value in counter A to %d\n", valueForCounterA)
		_, err = dbContract.SendSetValue(counterA.Contract.Address, valueForCounterA)
		require.NoError(t, err, "failed to set value in counter A: %w", err)

		t.Logf("Setting value in counter B to %d\n", valueForCounterB)
		_, err = dbContract.SendSetValue(counterB.Contract.Address, valueForCounterB)
		require.NoError(t, err, "failed to set value in counter B: %w", err)

		t.Logf("Sending ack to counter A\n")
		_, err = counterA.SendAck()
		require.NoError(t, err, "failed to send ack to counter A: %w", err)

		t.Logf("Committing transaction\n")
		_, err = dbContract.SendCommit()
		require.NoError(t, err, "failed to commit transaction: %w", err)
		t.Logf("Transaction committed\n")

		t.Logf("Checking value in counters\n")
		valueA, err := counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, initValue, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err := counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, initValue, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		t.Logf("Sending ack to counter B\n")
		_, err = counterB.SendAck()
		require.NoError(t, err, "failed to send ack to counter B: %w", err)

		t.Logf("Checking value in counters\n")
		valueA, err = counterA.GetValue()
		require.NoError(t, err, "failed to get value from counter A: %w", err)
		assert.Equal(t, valueForCounterA, valueA, "Counter A value mismatch: expected %d, got %d", valueForCounterA, valueA)
		valueB, err = counterB.GetValue()
		require.NoError(t, err, "failed to get value from counter B: %w", err)
		assert.Equal(t, valueForCounterB, valueB, "Counter B value mismatch: expected %d, got %d", valueForCounterB, valueB)

		t.Logf("Test completed successfully\n")
	})
}

package async

import (
	"fmt"
	"math/big"
	"math/rand/v2"

	"testing"

	counter "integration-tests/tracetracking/counter/wrappers"
	"integration-tests/tracetracking/testutils"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

func TestCounter(t *testing.T) {
	t.Run("TestCounter", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		seeders := testutils.SetUpTest(t, initialAmount, 1)
		alice := seeders[0]

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
}

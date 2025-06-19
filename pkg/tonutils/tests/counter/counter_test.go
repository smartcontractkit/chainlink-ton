package async_communication

import (
	"fmt"
	"math/big"
	"math/rand/v2"

	"testing"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils"
	counter "github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/counter/wrappers"
	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"

	"github.com/stretchr/testify/assert"
)

func TestCounter(t *testing.T) {
	t.Run("TestCounter", func(t *testing.T) {
		var initialAmount = big.NewInt(1_000_000_000_000)
		seeders := test_utils.SetUpTest(t, initialAmount, 1, bc.Nodes[0].ExternalHTTPUrl)
		alice := seeders[0]

		const transferAmount = 100

		fmt.Printf("\n\n\n\n\n\nTest Setup\n==========================\n")

		fmt.Printf("Deploying Counter contract\n")
		counter, err := counter.NewCounterProvider(alice).Deploy(counter.CounterInitData{ID: (rand.Uint32()), Value: 100})
		assert.NoError(t, err, "Failed to deploy Counter contract: %v", err)
		fmt.Printf("Counter contract deployed at %s\n", counter.Contract.Address.String())

		fmt.Printf("\n\n\n\n\n\nTest Started\n==========================\n")

		fmt.Printf("Checking initial value\n")
		result, err := counter.GetValue()
		assert.NoError(t, err, "Failed to get initial value: %v", err)
		expectedValue := uint32(100)
		assert.Equal(t, expectedValue, result, "Expected initial value %d, got %d", expectedValue, result)
		fmt.Printf("Initial value: %d\n", result)

		fmt.Printf("Sending SetCount request\n")
		_, msgReceived, err := counter.SendSetCount(1)
		assert.NoError(t, err, "Failed to send SetCount request: %v", err)
		assert.Equal(t, tonutils.ExitCode_Success, msgReceived.ExitCode, "Expected exit code 0, got %d", msgReceived.ExitCode)
		outgoingCount := len(msgReceived.OutgoingInternalReceivedMessages)
		assert.Equal(t, 1, outgoingCount, "Expected 1 outgoing internal received message, got %d", outgoingCount)
		internalExitCode := msgReceived.OutgoingInternalReceivedMessages[0].ExitCode
		assert.Equal(t, tonutils.ExitCode_Success, internalExitCode, "Expected exit code 0, got %d", internalExitCode)
		fmt.Printf("msgReceived: %+v\n", msgReceived)
		fmt.Printf("SetCount request sent\n")

		fmt.Printf("Checking result\n")
		result, err = counter.GetValue()
		assert.NoError(t, err, "Failed to get value: %v", err)
		expectedValue = uint32(1)
		assert.Equal(t, expectedValue, result, "Expected value %d, got %d", expectedValue, result)
		fmt.Printf("Result: %d\n", result)

		fmt.Printf("Test completed successfully\n")
	})
}

package tracetracking

import (
	"context"
	"fmt"
	"math/big"
	"testing"

	"integration-tests/tracetracking/test_utils"

	"github.com/stretchr/testify/assert"
	"github.com/xssnick/tonutils-go/tlb"
)

func TestDepositFees(t *testing.T) {
	var initialAmount = big.NewInt(1_000_000_000_000)
	accs := test_utils.SetUpTest(t, initialAmount, 2)
	alice := accs[0]
	bob := accs[1]

	var transferAmount = big.NewInt(100)
	fmt.Printf("\n\n\n\n\n\nTestStarted\n==========================\n")
	transfer, err := alice.Wallet.BuildTransfer(bob.Wallet.WalletAddress(), tlb.FromNanoTON(transferAmount), false, "deposit")
	assert.NoError(t, err, "Failed to build transfer: %w", err)
	externalMessageReceived, _, err := alice.SendWaitTransaction(context.TODO(), *bob.Wallet.WalletAddress(), transfer)
	assert.NoError(t, err, "Failed to send transaction: %w", err)
	fmt.Printf("\n==========================\nreceivedMessage: %+v\n==========================\n", externalMessageReceived)
	externalMessageReceived.WaitForTrace(&bob)
	assert.NoError(t, err, "Failed to wait for trace: %w", err)
	fmt.Printf("Transaction finalized\n")
	fmt.Printf("\n==========================\nFinalized msg: %+v\n==========================\n", externalMessageReceived)

	aliceBalance := test_utils.MustGetBalance(t, alice)
	test_utils.VerifyTransaction(t, externalMessageReceived, initialAmount, big.NewInt(0).Neg(transferAmount), aliceBalance)

	internalMessagedReceivedByBob := externalMessageReceived.OutgoingInternalReceivedMessages[0]
	assert.NotNil(t, internalMessagedReceivedByBob, "Internal message not received by Bob")
	bobBalance := test_utils.MustGetBalance(t, bob)
	test_utils.VerifyTransaction(t, internalMessagedReceivedByBob, initialAmount, transferAmount, bobBalance)
}

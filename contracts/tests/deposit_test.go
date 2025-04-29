package experimentation

import (
	"context"
	"fmt"
	"math/big"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/xssnick/tonutils-go/tlb"
)

func TestDepositFees(t *testing.T) {
	const initialAmmount = 1_000_000_000_000
	accs := setUpTest(t, initialAmmount, 2)
	alice := accs[0]
	bob := accs[1]

	const transferAmount = 100
	fmt.Printf("\n\n\n\n\n\nTestStarted\n==========================\n")
	transfer, err := alice.Wallet.BuildTransfer(bob.Wallet.WalletAddress(), tlb.FromNanoTON(big.NewInt(transferAmount)), false, "deposit")
	assert.NoError(t, err, "Failed to build transfer: %v", err)
	externalMessageReceived, err := alice.SendWaitTransaction(context.TODO(), *bob.Wallet.WalletAddress(), transfer)
	assert.NoError(t, err, "Failed to send transaction: %v", err)
	fmt.Printf("\n==========================\nreceivedMessage: %+v\n==========================\n", externalMessageReceived)
	externalMessageReceived.WaitForTrace(&bob)
	assert.NoError(t, err, "Failed to wait for trace: %v", err)
	fmt.Printf("Transaction finalized\n")
	fmt.Printf("\n==========================\nFinalized msg: %+v\n==========================\n", externalMessageReceived)

	aliceBalance := MustGetBalance(t, alice)
	verifyTransaction(t, externalMessageReceived, initialAmmount, -int(transferAmount), aliceBalance)

	internalMessagedReceivedByBob := externalMessageReceived.OutgoingMessagesReceived[0]
	assert.NotNil(t, internalMessagedReceivedByBob, "Internal message not received by Bob")
	bobBalance := MustGetBalance(t, bob)
	verifyTransaction(t, internalMessagedReceivedByBob, initialAmmount, transferAmount, bobBalance)
}

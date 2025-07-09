package tracetracking

import (
	"context"
	"fmt"
	"math/big"
	"testing"

	"integration-tests/tracetracking/testutils"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
)

func TestDepositFees(t *testing.T) {
	var initialAmount = big.NewInt(1_000_000_000_000)
	accs := testutils.SetUpTest(t, chainsel.TON_LOCALNET.Selector, initialAmount, 2)
	alice := accs[0]
	bob := accs[1]

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
}

package experimentation

import (
	"fmt"
	"math/big"
	"testing"

	"github.com/stretchr/testify/assert"

	"context"

	"github.com/xssnick/tonutils-go/tlb"
)

func TestLowBalanceReplayAttack(t *testing.T) {
	const initialAmmount = 1_000_000_000_000

	// Connect to TON testnet
	accs := setUpTest(t, initialAmmount, 2)
	alice := accs[0]
	bob := accs[1]

	fmt.Printf("\n\n\n\n\n\nTestStarted\n==========================\n")
	// Try deposit with low lastBalance
	lastBalance, err := GetBalance(alice)
	fmt.Println("=============\nAlice's Balance:", lastBalance)
	assert.NoError(t, err, "Failed to get balance: %v", err)
	balanceCoin := tlb.FromNanoTON(new(big.Int).SetUint64(uint64(lastBalance + 1)))
	walletSeqno := uint(0)
	fmt.Printf("Initial wallet seqno: %d (wallet not initialized)\n", walletSeqno)
	for range 3 {
		// Build transfer
		outgoingTransfer, err := alice.Wallet.BuildTransfer(bob.Wallet.WalletAddress(), balanceCoin, false, "deposit")
		assert.NoError(t, err, "Failed to build transfer: %v", err)
		resultMessage, err := alice.SendWaitTransactionRercursively(context.TODO(), *bob.Wallet.WalletAddress(), outgoingTransfer)
		if err != nil {
			fmt.Println("Error:", err)
		}

		newBalance, err := GetBalance(alice)
		assert.NoError(t, err, "Failed to get balance: %v", err)
		verifyTransaction(t, resultMessage, lastBalance, 0, newBalance)
		lastBalance = newBalance
		newWalletSeqno, err := GetWalletSeqno(alice)
		assert.NoError(t, err, "Failed to get seqno: %v", err)
		if assert.Greaterf(t, newWalletSeqno, walletSeqno, "Wallet seqno did not increase. This would make a wallet vulnerable to replay attacks") {
			fmt.Printf("Wallet seqno increased: %d -> %d\n", walletSeqno, newWalletSeqno)
		}
		walletSeqno = newWalletSeqno
	}
}

package async_communication

import (
	"fmt"
	"math/big"
	"testing"
	"time"

	"github.com/smartcontractkit/chainlink-ton/pkg/tonutils/tests/test_utils"
	"github.com/stretchr/testify/assert"

	"context"

	"github.com/xssnick/tonutils-go/tlb"
)

func TestLowBalanceReplayAttack(t *testing.T) {
	var initialAmount = big.NewInt(1_000_000_000_000)

	// Connect to TON testnet
	accs := test_utils.SetUpTest(t, initialAmount, 2)
	alice := accs[0]
	bob := accs[1]

	fmt.Printf("\n\n\n\n\n\nTestStarted\n==========================\n")
	// Try deposit with low lastBalance
	lastBalance, err := test_utils.GetBalance(alice)
	fmt.Println("=============\nAlice's Balance:", lastBalance)
	assert.NoError(t, err, "Failed to get balance: %v", err)
	balanceCoin := tlb.FromNanoTON(new(big.Int).Add(lastBalance, big.NewInt(1)))
	walletSeqno := uint(0)
	fmt.Printf("Initial wallet seqno: %d (wallet not initialized)\n", walletSeqno)
	for range 3 {
		// Build transfer
		outgoingTransfer, err := alice.Wallet.BuildTransfer(bob.Wallet.WalletAddress(), balanceCoin, false, "deposit")
		assert.NoError(t, err, "Failed to build transfer: %v", err)
		resultMessage, err := alice.SendWaitTransactionRecursively(context.TODO(), *bob.Wallet.WalletAddress(), outgoingTransfer)
		if err != nil {
			fmt.Println("Error:", err)
		}

		time.Sleep(time.Second * 5)
		newBalance, err := test_utils.GetBalance(alice)
		assert.NoError(t, err, "Failed to get balance: %v", err)
		test_utils.VerifyTransaction(t, resultMessage, lastBalance, big.NewInt(0), newBalance)
		lastBalance = newBalance
		newWalletSeqno, err := test_utils.GetWalletSeqno(alice)
		assert.NoError(t, err, "Failed to get seqno: %v", err)
		if assert.Greaterf(t, newWalletSeqno, walletSeqno, "Wallet seqno did not increase. This would make a wallet vulnerable to replay attacks") {
			fmt.Printf("Wallet seqno increased: %d -> %d\n", walletSeqno, newWalletSeqno)
		}
		walletSeqno = newWalletSeqno
	}
}

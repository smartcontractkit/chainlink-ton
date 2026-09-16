package monitor_test

import (
	"context"
	"sync"
	"testing"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	commonconfig "github.com/smartcontractkit/chainlink-common/pkg/config"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/monitoring/balance"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	test_utils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/relay/monitor"
	relayer_utils "github.com/smartcontractkit/chainlink-ton/pkg/relay/testutils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

func TestBalanceMonitor_DirectClient(t *testing.T) {
	lggr := logger.Test(t)

	var setupOnce sync.Once
	tonChain, err := test_utils.StartChain(t, chainsel.TON_LOCALNET.Selector, &setupOnce)
	require.NoError(t, err)

	walletAddr := tonChain.Wallet.WalletAddress().String()
	lggr.Infow("Testing balance for wallet", "address", walletAddr)

	// Get the current balance
	bal, err := monitor.GetAccountBalance(t.Context(), tonChain.Client, walletAddr)
	require.NoError(t, err)

	lggr.Infow("Wallet balance fetched successfully", "address", walletAddr, "balance", bal, "unit", "TON")

	// Verify the balance is exactly 1000 TON (test_utils.StartChain initializes with 1000 TON)
	require.InDelta(t, 1000.0, bal, 0.1)
}

func TestBalanceMonitor_BalanceChanges(t *testing.T) {
	lggr := logger.Test(t)

	var setupOnce sync.Once
	tonChain, err := test_utils.StartChain(t, chainsel.TON_LOCALNET.Selector, &setupOnce)
	require.NoError(t, err)

	// Wallet 1: sender, funded with 1000 TON by test_utils.StartChain
	senderAddr := tonChain.Wallet.WalletAddress()
	senderInitialBalance, err := monitor.GetAccountBalance(t.Context(), tonChain.Client, senderAddr.String())
	require.NoError(t, err)
	require.InDelta(t, 1000.0, senderInitialBalance, 0.1, "Sender initial balance should be 1000 TON")
	lggr.Infow("Sender initial balance", "address", senderAddr.String(), "balance", senderInitialBalance, "unit", "TON")

	// Wallet 2: recipient wallet, starts with 0 TON
	recipientWallet, err := tvm.NewRandomHighloadV3TestWallet(tonChain.Client)
	require.NoError(t, err)
	recipientAddr := recipientWallet.WalletAddress()

	// Confirm recipient starts with 0 TON
	recipientInitialBalance, err := monitor.GetAccountBalance(t.Context(), tonChain.Client, recipientAddr.String())
	require.NoError(t, err)
	require.InDelta(t, 0.0, recipientInitialBalance, 0.01)
	lggr.Infow("Recipient initial balance", "address", recipientAddr.String(), "balance", recipientInitialBalance, "unit", "TON")

	// Send multiple transactions from sender to recipient
	signedClient := tracetracking.NewSignedAPIClient(tonChain.Client, *tonChain.Wallet)
	numTxs := 10
	transferAmount := tlb.MustFromTON("5.0")
	totalTransferred := float64(numTxs) * 5.0
	for i := range numTxs {
		lggr.Infow("Sending transaction", "index", i+1, "from", senderAddr.String(), "to", recipientAddr.String(), "amount", "5 TON")
		var transfer *wallet.Message
		transfer, err = tonChain.Wallet.BuildTransfer(recipientAddr, transferAmount, false, "test transfer")
		require.NoError(t, err)
		_, err = signedClient.SendAndWaitForTrace(t.Context(), *recipientAddr, transfer)
		require.NoError(t, err)
	}

	// Check final balances
	senderFinalBalance, err := monitor.GetAccountBalance(t.Context(), tonChain.Client, senderAddr.String())
	require.NoError(t, err)
	lggr.Infow("Sender final balance", "address", senderAddr.String(), "balance", senderFinalBalance, "unit", "TON")

	recipientFinalBalance, err := monitor.GetAccountBalance(t.Context(), tonChain.Client, recipientAddr.String())
	require.NoError(t, err)
	lggr.Infow("Recipient final balance", "address", recipientAddr.String(), "balance", recipientFinalBalance, "unit", "TON")

	// Verify sender balance decreased by transfers + some amount of gas fees
	senderDecrease := senderInitialBalance - senderFinalBalance
	require.Greater(t, senderDecrease, totalTransferred, "Sender balance should decrease by at least the transfer amount")
	require.Less(t, senderDecrease, totalTransferred+1.0, "Sender balance decrease should not exceed transfers + ~1 TON in gas fees")

	// Verify recipient balance increased by exactly the transfer amount
	recipientIncrease := recipientFinalBalance - recipientInitialBalance
	require.InDelta(t, totalTransferred, recipientIncrease, 0.01, "Recipient should receive exactly the transferred amount")

	lggr.Infow("Balance changes verified",
		"senderInitial", senderInitialBalance,
		"senderFinal", senderFinalBalance,
		"senderDecrease", senderDecrease,
		"recipientInitial", recipientInitialBalance,
		"recipientFinal", recipientFinalBalance,
		"recipientIncrease", recipientIncrease,
		"totalTransferred", totalTransferred,
		"numTransactions", numTxs,
	)
}

func TestBalanceMonitor_Polling(t *testing.T) {
	lggr := logger.Test(t)

	var setupOnce sync.Once
	tonChain, err := test_utils.StartChain(t, chainsel.TON_LOCALNET.Selector, &setupOnce)
	require.NoError(t, err)

	keystore := relayer_utils.NewTestKeystore(t)
	keystore.AddKey(tonChain.Wallet.PrivateKey())
	require.NotNil(t, keystore)

	opts := monitor.BalanceMonitorOpts{
		ChainInfo: balance.ChainInfo{
			ChainFamilyName: "ton",
			ChainID:         string(chainsel.TON_LOCALNET.ChainID),
			NetworkName:     "localnet",
			NetworkNameFull: "ton-localnet",
		},
		Config: balance.GenericBalanceConfig{
			BalancePollPeriod: *commonconfig.MustNewDuration(1 * time.Minute),
		},
		Logger:   lggr,
		Keystore: keystore,
		NewClient: func(ctx context.Context) (ton.APIClientWrapped, error) {
			return tonChain.Client, nil
		},
	}

	// Create and start balance monitor
	balanceMonitor, err := monitor.NewBalanceMonitor(opts)
	require.NoError(t, err)
	require.NotNil(t, balanceMonitor)
	err = balanceMonitor.Start(t.Context())
	require.NoError(t, err)
	defer func() {
		_ = balanceMonitor.Close()
	}()

	// Wait a bit to allow the monitor to poll at least once
	time.Sleep(2 * time.Second)

	// Check health report
	health := balanceMonitor.HealthReport()
	require.NotNil(t, health)
	lggr.Infow("Balance monitor health report", "health", health)

	// Verify the monitor is healthy
	for name, err := range health {
		require.NoError(t, err, "Balance monitor component %s should be healthy", name)
	}
}

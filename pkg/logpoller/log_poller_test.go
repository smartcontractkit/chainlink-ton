package logpoller_test

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/testutils"
)

// TODO: probably it would be the best practice to keeping only unit tests here
// TODO: but for PoC I'm putting everything here.
func Test_LogPoller(t *testing.T) {
	// TODO: mylocalton test util
	// TODO: test wallet creation and funding test util
	// TODO: contract deployment test util
	// TODO: example contract go wrapper
	// TODO: log poller functionality test
	// TODO: log poller functionality test

	var client ton.APIClientWrapped
	var w *wallet.Wallet

	var lp *logpoller.Service

	var contractAddress *address.Address

	t.Run("connection and funding deployer", func(t *testing.T) {
		connectionPool := liteclient.NewConnectionPool()
		cfg, err := liteclient.GetConfigFromUrl(t.Context(), "http://127.0.0.1:8000/localhost.global.config.json")
		require.NoError(t, err, "Failed to get network config")
		err = connectionPool.AddConnectionsFromConfig(t.Context(), cfg)
		require.NoError(t, err, "Failed to connect to TON network")

		client = ton.NewAPIClient(connectionPool).WithRetry()
		w = createTonWallet(t, client, wallet.V3R2, wallet.WithWorkchain(0))
		fundTonWallets(t, client, []*address.Address{w.WalletAddress()}, []tlb.Coins{tlb.MustFromTON("1000")})

		require.Eventually(t, func() bool {
			block, err := client.CurrentMasterchainInfo(t.Context())
			require.NoError(t, err)

			balance, err := w.GetBalance(t.Context(), block)
			require.NoError(t, err)
			return !balance.IsZero()
		}, 60*time.Second, 500*time.Millisecond)
	})

	t.Run("Deploy Test Contract", func(t *testing.T) {
		t.Log("Deploy wallet:", w.WalletAddress().String())
		msgBody := cell.BeginCell().EndCell()

		t.Log("Deploying contract with wallet:", w.WalletAddress().String())
		addr, _, _, err := w.DeployContractWaitTransaction(t.Context(), tlb.MustFromTON("0.02"),
			msgBody, getTestContractCode(), getContractData(w.WalletAddress()))
		require.NoError(t, err, "Failed to deploy contract")

		t.Log("Deployed contract addr:", addr.String())
		contractAddress = addr
		// TODO: need a better way to wait for contract deployment - rely on test util(transaction tracker)
		time.Sleep(15 * time.Second)
	})

	// Add this to your test file - complete the "increase counter and listen to the event" test
	t.Run("increase counter and listen to the event", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		// Get initial counter value
		initialValue, err := testutils.GetCounterValue(ctx, client, contractAddress)
		require.NoError(t, err, "Failed to get initial counter value")
		t.Logf("Initial counter value: %d", initialValue)

		// Send a message to increment the counter (any message will increment it based on your contract)
		msgBody := cell.BeginCell().
			MustStoreUInt(0x12345678, 32). // Any operation code (not reset)
			MustStoreUInt(0, 64).          // queryId
			EndCell()

		msg := &wallet.Message{
			Mode: 1, // Normal sending mode
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      true,
				DstAddr:     contractAddress,
				Amount:      tlb.MustFromTON("0.1"),
				Body:        msgBody,
			},
		}

		_, _, err = w.SendWaitTransaction(ctx, msg)
		require.NoError(t, err, "Failed to send increment transaction")

		// Wait for transaction processing
		time.Sleep(10 * time.Second)

		// Verify counter was incremented
		newValue, err := testutils.GetCounterValue(ctx, client, contractAddress)
		require.NoError(t, err, "Failed to get new counter value")
		t.Logf("New counter value: %d", newValue)

		expectedValue := big.NewInt(0).Add(initialValue, big.NewInt(1))
		require.Equal(t, 0, newValue.Cmp(expectedValue), "Counter should have incremented by 1")
	})

	// Add this to your test file - reset counter test
	t.Run("reset counter", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		// Send reset message (only owner can do this)
		msgBody := cell.BeginCell().
			MustStoreUInt(0x3dc2af2d, 32). // op_reset_counter
			MustStoreUInt(0, 64).          // queryId
			EndCell()

		msg := &wallet.Message{
			Mode: 1,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      true,
				DstAddr:     contractAddress,
				Amount:      tlb.MustFromTON("0.1"),
				Body:        msgBody,
			},
		}

		_, _, err := w.SendWaitTransaction(ctx, msg)
		require.NoError(t, err, "Failed to send reset transaction")

		time.Sleep(5 * time.Second)

		// Verify counter was reset to 0
		resetValue, err := testutils.GetCounterValue(ctx, client, contractAddress)
		require.NoError(t, err, "Failed to get reset counter value")
		t.Logf("Counter value after reset: %d", resetValue)

		require.Equal(t, 0, resetValue.Cmp(big.NewInt(0)), "Counter should be reset to 0")
	})

	t.Run("Start LogPoller", func(t *testing.T) {
		t.Skip("Skipping log poller test, register contracts / events first once PoC is done")
		lggr := logger.Test(t)
		lp = logpoller.NewLogPoller(lggr, client)
		lp.Start(t.Context())
	})
}

// TODO: this should be handled in build process, but for now we are using hardcoded contract code
func getTestContractCode() *cell.Cell {
	var hexBOC = "b5ee9c724101070100db000114ff00f4a413f4bcf2c80b01020162020401f6d0eda2edfbed44d0fa4001f861d31f30f86201d0d30331fa4030f8415210c70522c700b3b08e3b01d31f3082103dc2af2dba8e2d70f862c8f841cf16f84201cb1fc9ed548b02f823800cc8cb0358cf16811001cf0b71cb1f01cf16c970fb00db31e09131e2f842a4f862c8f841cf16f84201cb1fc9ed548b02f823030038f842800cc8cb035003cf16811002cf0b71cb1fcb1f01cf16c970fb0002012005060023be28ef6a2687d2000fc30e98f987c317c20c0023bcd0c76a2687d2000fc30e98f987c317c2149b938421"
	codeCellBytes, _ := hex.DecodeString(hexBOC)

	codeCell, err := cell.FromBOC(codeCellBytes)
	if err != nil {
		panic(err)
	}

	return codeCell
}

// TODO: use it from go bindings
func getContractData(ownerAddr *address.Address) *cell.Cell {
	// Storage schema for the Tolk contract:
	// ctxOwnerAddress: address (loaded first)
	// ctxCounter: uint32 (loaded second)

	data := cell.BeginCell().
		MustStoreAddr(ownerAddr). // Store owner address first
		MustStoreUInt(0, 32).     // Store initial counter value (0) as 32-bit uint
		EndCell()

	return data
}

// TODO: use it from shared test utils
func createTonWallet(t *testing.T, client ton.APIClientWrapped, version wallet.VersionConfig, option wallet.Option) *wallet.Wallet {
	seed := wallet.NewSeed()
	rw, err := wallet.FromSeed(client, seed, version)
	require.NoError(t, err, fmt.Errorf("Failed to generate random wallet: %v", err))
	pw, perr := wallet.FromPrivateKeyWithOptions(client, rw.PrivateKey(), version, option)
	require.NoError(t, perr)
	require.NoError(t, perr, fmt.Errorf("Failed to generate random wallet: %v", err))
	return pw
}

// TODO: use it from shared test utils
func fundTonWallets(t *testing.T, client ton.APIClientWrapped, recipients []*address.Address, amounts []tlb.Coins) {
	rawHlWallet, err := wallet.FromSeed(client, strings.Fields(blockchain.DefaultTonHlWalletMnemonic), wallet.HighloadV2Verified)
	require.NoError(t, err, "failed to create highload wallet")
	mcFunderWallet, err := wallet.FromPrivateKeyWithOptions(client, rawHlWallet.PrivateKey(), wallet.HighloadV2Verified, wallet.WithWorkchain(-1))
	require.NoError(t, err, "failed to create highload wallet")
	subWalletID := uint32(42)
	funder, err := mcFunderWallet.GetSubwallet(subWalletID)
	require.NoError(t, err, "failed to get highload subwallet")
	// double check funder address
	require.Equal(t, funder.Address().StringRaw(), blockchain.DefaultTonHlWalletAddress, "funder address mismatch")

	if len(recipients) != len(amounts) {
		t.Fatalf("number of recipients (%d) does not match number of amounts (%d)", len(recipients), len(amounts))
	}

	messages := make([]*wallet.Message, len(recipients))
	for i, addr := range recipients {
		transfer, terr := funder.BuildTransfer(addr, amounts[i], false, "")
		require.NoError(t, terr, fmt.Sprintf("failed to build transfer for %s", addr.String()))
		messages[i] = transfer
	}
	_, _, txerr := funder.SendManyWaitTransaction(t.Context(), messages)
	require.NoError(t, txerr, "airdrop transaction failed")
	// we don't wait for the transaction to be confirmed here, as it may take some time
}

package test

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-testing-framework/framework"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"
)

type CfgTon struct {
	BlockchainA *blockchain.Input `toml:"blockchain_a" validate:"required"`
}

func TestTonSmoke(t *testing.T) {
	in, err := framework.Load[CfgTon](t)
	require.NoError(t, err)

	goal := 120

	startTime := time.Now()
	t.Logf("==============================================================")
	t.Logf("Starting blockchain network creation with timeout goal: %ds", goal)

	bc, err := blockchain.NewBlockchainNetwork(in.BlockchainA)

	elapsed := time.Since(startTime)
	t.Logf("Blockchain network creation completed in: %v (goal: %ds)", elapsed, goal)
	t.Logf("==============================================================")

	if elapsed > time.Duration(goal)*time.Second {
		t.Logf("WARNING: Blockchain network creation exceeded timeout goal by %v", elapsed-(time.Duration(goal)*time.Second))
	}

	require.NoError(t, err)

	var client ton.APIClientWrapped

	t.Run("setup:connect", func(t *testing.T) {
		connectionPool := liteclient.NewConnectionPool()
		cfg, cferr := liteclient.GetConfigFromUrl(t.Context(), bc.NetworkSpecificData.TonGlobalConfigURL)

		require.NoError(t, cferr, "Failed to get config from URL")
		caerr := connectionPool.AddConnectionsFromConfig(t.Context(), cfg)
		require.NoError(t, caerr, "Failed to add connections from config")
		client = ton.NewAPIClient(connectionPool).WithRetry()

		t.Run("setup:faucet", func(t *testing.T) {
			// network is already funded
			rawHlWallet, err := wallet.FromSeed(client, strings.Fields(blockchain.DefaultTonHlWalletMnemonic), wallet.HighloadV2Verified)
			require.NoError(t, err, "failed to create highload wallet")
			mcFunderWallet, err := wallet.FromPrivateKeyWithOptions(client, rawHlWallet.PrivateKey(), wallet.HighloadV2Verified, wallet.WithWorkchain(-1))
			require.NoError(t, err, "failed to create highload wallet")
			funder, err := mcFunderWallet.GetSubwallet(uint32(42))
			require.NoError(t, err, "failed to get highload subwallet")

			// double check funder address
			require.Equal(t, funder.Address().StringRaw(), blockchain.DefaultTonHlWalletAddress, "funder address mismatch")

			// check funder balance
			master, err := client.GetMasterchainInfo(t.Context())
			require.NoError(t, err, "failed to get masterchain info for funder balance check")
			funderBalance, err := funder.GetBalance(t.Context(), master)
			require.NoError(t, err, "failed to get funder balance")
			require.Equal(t, funderBalance.Nano().String(), "1000000000000000", "funder balance mismatch")
		})
	})
}

package utils

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/hashicorp/consul/sdk/freeport"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/stretchr/testify/require"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-testing-framework/framework"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"
)

var once = &sync.Once{}

func CreateTonWallet(t *testing.T, client ton.APIClientWrapped, version wallet.VersionConfig, option wallet.Option) *wallet.Wallet {
	seed := wallet.NewSeed()
	rw, err := wallet.FromSeed(client, seed, version)
	require.NoError(t, err, "failed to generate random wallet: %w", err)
	pw, perr := wallet.FromPrivateKeyWithOptions(client, rw.PrivateKey(), version, option)
	require.NoError(t, perr, "failed to generate random wallet: %w", err)
	return pw
}

func FundTonWallets(t *testing.T, client ton.APIClientWrapped, recipients []*address.Address, amounts []tlb.Coins) {
	t.Logf("Funding %d wallets", len(recipients))
	walletVersion := wallet.HighloadV2Verified //nolint:staticcheck // only option in mylocalton-docker
	rawHlWallet, err := wallet.FromSeed(client, strings.Fields(blockchain.DefaultTonHlWalletMnemonic), walletVersion)
	require.NoError(t, err, "failed to create highload wallet")
	mcFunderWallet, err := wallet.FromPrivateKeyWithOptions(client, rawHlWallet.PrivateKey(), walletVersion, wallet.WithWorkchain(-1))
	require.NoError(t, err, "failed to create highload wallet")
	subWalletID := uint32(42)
	funder, err := mcFunderWallet.GetSubwallet(subWalletID)
	require.NoError(t, err, "failed to get highload subwallet")
	// double check funder address
	require.Equal(t, blockchain.DefaultTonHlWalletAddress, funder.Address().StringRaw(), "funder address mismatch")

	if len(recipients) != len(amounts) {
		t.Fatalf("number of recipients (%d) does not match number of amounts (%d)", len(recipients), len(amounts))
	}

	messages := make([]*wallet.Message, len(recipients))
	for i, addr := range recipients {
		transfer, terr := funder.BuildTransfer(addr, amounts[i], false, "")
		require.NoError(t, terr, "failed to build transfer for %w", addr.String())
		messages[i] = transfer
	}
	_, _, txerr := funder.SendManyWaitTransaction(t.Context(), messages)
	require.NoError(t, txerr, "airdrop transaction failed")

	err = waitForAirdropCompletion(t, client, recipients, amounts, 60*time.Second, false)
	require.NoError(t, err, "airdrop completion verification failed")
	t.Logf("%d wallets funded", len(recipients))
}

func waitForAirdropCompletion(t *testing.T, client ton.APIClientWrapped, recipients []*address.Address, expectedAmounts []tlb.Coins, timeout time.Duration, verbose bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	// get initial balances
	initialBalances := make(map[string]tlb.Coins)
	currentBlock, err := client.CurrentMasterchainInfo(ctx)
	require.NoError(t, err, "failed to get current block")
	for _, addr := range recipients {
		if acc, err := client.GetAccount(ctx, currentBlock, addr); err == nil {
			initialBalances[addr.String()] = acc.State.Balance
		} else {
			initialBalances[addr.String()] = tlb.ZeroCoins // the account might not exist yet
		}
	}
	completed := make(chan string, len(recipients))
	// concurrently check balances
	for i, addr := range recipients {
		go func(addr *address.Address, expectedAmount, initialBalance tlb.Coins) {
			ticker := time.NewTicker(time.Second)
			defer ticker.Stop()

			expectedMin := tlb.MustFromNano(
				initialBalance.Nano().Add(initialBalance.Nano(), expectedAmount.Nano()), 9)

			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					block, err := client.CurrentMasterchainInfo(ctx)
					if err != nil {
						continue
					}
					acc, err := client.GetAccount(ctx, block, addr)
					if err != nil {
						continue
					}
					if acc.State.Balance.Nano().Cmp(expectedMin.Nano()) >= 0 {
						if verbose {
							t.Logf("%s balance is sufficient: %s >= %s", addr.String(), acc.State.Balance.String(), expectedMin.String())
						}
						completed <- addr.String()
						return
					}
				}
			}
		}(addr, expectedAmounts[i], initialBalances[addr.String()])
	}

	// wait for all to complete
	count := 0
	for {
		select {
		case <-completed:
			count++
			if count == len(recipients) {
				t.Log("✓ Airdrop completed")
				return nil
			}
		case <-ctx.Done():
			return fmt.Errorf("timeout: %d/%d completed", count, len(recipients))
		}
	}
}

func StartTonChain(t *testing.T, nodeClient *ton.APIClient, chainID uint64, deployerWallet *wallet.Wallet) cldf_ton.Chain {
	t.Helper()
	ton := cldf_ton.Chain{
		ChainMetadata: cldf_ton.ChainMetadata{Selector: chainID},
		Client:        nodeClient,
		Wallet:        deployerWallet,
		WalletAddress: deployerWallet.Address(),
	}
	return ton
}

func CreateAPIClient(t *testing.T, chainID uint64) *ton.APIClient {
	t.Helper()
	err := framework.DefaultNetwork(once)
	require.NoError(t, err)

	port := freeport.GetOne(t)

	bcInput := &blockchain.Input{
		ChainID: strconv.FormatUint(chainID, 10),
		Type:    "ton",
		Image:   "ghcr.io/neodix42/mylocalton-docker:latest",
		PullImage: true,
		Port:    strconv.Itoa(port),
	}

	bcOut, err := blockchain.NewBlockchainNetwork(bcInput)
	require.NoError(t, err, "failed to create blockchain network")

	t.Cleanup(func() {
		ctfErr := framework.RemoveTestContainers()
		require.NoError(t, ctfErr, "failed to remove test containers")
		freeport.Return([]int{port})
	})

	networkCfg := fmt.Sprintf("http://%s/localhost.global.config.json", bcOut.Nodes[0].ExternalHTTPUrl)

	cfg, err := liteclient.GetConfigFromUrl(t.Context(), networkCfg)
	require.NoError(t, err, "failed to get config from URL: %w", networkCfg)

	connectionPool := liteclient.NewConnectionPool()
	err = connectionPool.AddConnectionsFromConfig(t.Context(), cfg)
	require.NoError(t, err)

	client := ton.NewAPIClient(connectionPool, ton.ProofCheckPolicyFast)
	client.SetTrustedBlockFromConfig(cfg)

	_, err = client.GetMasterchainInfo(t.Context())
	require.NoError(t, err, "TON network not ready")

	return client
}

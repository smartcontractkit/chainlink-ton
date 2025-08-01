package utils

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
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

	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"
)

func CreateRandomWallet(t *testing.T, client ton.APIClientWrapped, version wallet.VersionConfig, option wallet.Option) *wallet.Wallet {
	seed := wallet.NewSeed()
	rw, err := wallet.FromSeed(client, seed, version)
	require.NoError(t, err, "failed to generate random wallet: %w", err)
	pw, perr := wallet.FromPrivateKeyWithOptions(client, rw.PrivateKey(), version, option)
	require.NoError(t, perr, "failed to generate random wallet: %w", err)
	return pw
}

func CreateRandomHighloadWallet(t *testing.T, client ton.APIClientWrapped) *wallet.Wallet {
	seed := wallet.NewSeed()
	w, err := wallet.FromSeed(client, seed, wallet.ConfigHighloadV3{
		MessageTTL: 60 * 5,
		MessageBuilder: func(ctx context.Context, subWalletId uint32) (id uint32, createdAt int64, err error) {
			// Due to specific of externals emulation on liteserver,
			// we need to take something less than or equals to block time, as message creation time,
			// otherwise external message will be rejected, because time will be > than emulation time
			// hope it will be fixed in the next LS versions
			createdAt = time.Now().Unix() - 30

			// example query id which will allow you to send 1 tx per second
			// but you better to implement your own iterator in database, then you can send unlimited
			// but make sure id is less than 1 << 23, when it is higher start from 0 again
			return uint32(createdAt % (1 << 23)), createdAt, nil //nolint:gosec // test wallet
		},
	})
	require.NoError(t, err, "failed to generate random wallet: %w", err)
	return w
}

func FundWallets(t *testing.T, client ton.APIClientWrapped, recipients []*address.Address, amounts []tlb.Coins) {
	t.Logf("╭ Funding %d wallets", len(recipients))
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
	t.Logf("╰ %d wallets funded", len(recipients))
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
			if acc.State != nil {
				t.Logf("Account state for %s: %v", addr.String(), acc.State)
				t.Log("Initial balance for", addr.String(), "is", acc.State.Balance.String())
				initialBalances[addr.String()] = acc.State.Balance
			} else {
				initialBalances[addr.String()] = tlb.ZeroCoins
			}
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
					if acc.State != nil && acc.State.Balance.Nano().Cmp(expectedMin.Nano()) >= 0 {
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

func StartChain(t *testing.T, nodeClient *ton.APIClient, chainID uint64, deployerWallet *wallet.Wallet) cldf_ton.Chain {
	t.Helper()
	ton := cldf_ton.Chain{
		ChainMetadata: cldf_ton.ChainMetadata{Selector: chainID},
		Client:        nodeClient,
		Wallet:        deployerWallet,
		WalletAddress: deployerWallet.Address(),
	}
	return ton
}

// CreateAPIClient sets up a TON API client for integration tests.
// It reads env::USE_EXISTING_TON_NODE to decide whether to create a new
// ephemeral network or connect to a pre-existing one.
func CreateAPIClient(t *testing.T, chainID uint64) *ton.APIClient {
	t.Helper()

	var networkCfg string
	var err error

	if os.Getenv("USE_EXISTING_TON_NODE") == "true" {
		networkCfg = getExistingNetworkConfig(t, chainID)
	} else {
		networkCfg = createNewNetwork(t, chainID)
	}

	cfg, err := liteclient.GetConfigFromUrl(t.Context(), networkCfg)
	require.NoError(t, err, "failed to get config from URL: %s", networkCfg)

	connectionPool := liteclient.NewConnectionPool()
	err = connectionPool.AddConnectionsFromConfig(t.Context(), cfg)
	require.NoError(t, err)

	client := ton.NewAPIClient(connectionPool, ton.ProofCheckPolicyFast)
	client.SetTrustedBlockFromConfig(cfg)

	_, err = client.GetMasterchainInfo(t.Context())
	require.NoError(t, err, "TON network not ready")

	return client
}

// getExistingNetworkConfig returns the hardcoded configuration for a pre-existing network.
func getExistingNetworkConfig(t *testing.T, chainID uint64) string {
	t.Helper()
	t.Logf("Using existing network for chain ID %d", chainID)
	return "http://localhost:8000/localhost.global.config.json"
}

// createNewNetwork provisions a new, temporary TON network for the test's duration.
// It handles port allocation and automatic container cleanup.
func createNewNetwork(t *testing.T, chainID uint64) string {
	t.Helper()
	t.Logf("Creating new ephemeral network for chain ID %d", chainID)

	port := freeport.GetOne(t)
	bcInput := &blockchain.Input{
		ChainID: strconv.FormatUint(chainID, 10),
		Type:    "ton",
		Port:    strconv.Itoa(port),
		CustomEnv: map[string]string{
			"VERSION_CAPABILITIES":        "11",
			"NEXT_BLOCK_GENERATION_DELAY": "0.5",
		},
	}

	bcOut, err := blockchain.NewBlockchainNetwork(bcInput)
	require.NoError(t, err, "failed to create blockchain network")

	// The cleanup function ensures the temporary network is terminated after the test.
	t.Cleanup(func() {
		if bcOut.Container != nil && bcOut.Container.IsRunning() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if cterr := bcOut.Container.Terminate(ctx); cterr != nil {
				t.Logf("Container termination failed: %v", cterr)
			}
		}
		freeport.Return([]int{port})
	})

	return fmt.Sprintf("http://%s/localhost.global.config.json", bcOut.Nodes[0].ExternalHTTPUrl)
}

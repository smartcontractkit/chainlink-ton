package utils //nolint:revive,nolintlint // TODO: update to meaningful package name

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
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/stretchr/testify/require"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"

	tonchain "github.com/smartcontractkit/chainlink-ton/pkg/ton/chain"
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
					if err != nil || !acc.IsActive {
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
				t.Logf("✓ Airdrop completed, all %d recipients funded", count)
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

// CreateTestAPIClient is a test helper that wraps CreateAPIClient and registers cleanup with testing.T
func CreateTestAPIClient(t *testing.T, chainID uint64) (*ton.APIClient, error) {
	t.Helper()

	port := freeport.GetOne(t)
	client, cleanup, err := CreateAPIClient(t.Context(), chainID, port)
	if err != nil {
		return nil, err
	}

	t.Cleanup(cleanup)
	return client, nil
}

// CreateAPIClient sets up a TON API client. Returns the client, cleanup function, and error.
// The caller is responsible for calling the cleanup function when done.
// Note: For new networks, a port must be provided since freeport allocation requires testing context.
func CreateAPIClient(ctx context.Context, chainID uint64, port int) (*ton.APIClient, func(), error) {
	var client *ton.APIClient
	var cleanup func()
	var err error

	// Read env::USE_EXISTING_TON_NODE to decide whether to create a new ephemeral network
	// or connect to a pre-existing one(for faster iteration).
	if os.Getenv("USE_EXISTING_TON_NODE") == "true" {
		client, err = getExistingNetworkConnection(ctx)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to get existing network connection string: %w", err)
		}
		cleanup = func() {} // no-op cleanup for existing network
	} else {
		client, cleanup, err = createNewNetwork(ctx, chainID, port)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to create new network: %w", err)
		}
	}

	// test connection
	mb, merr := client.GetMasterchainInfo(ctx)
	if merr != nil {
		if cleanup != nil {
			cleanup() // cleanup on error
		}
		return nil, nil, fmt.Errorf("TON network not ready: %w", merr)
	}
	client.SetTrustedBlock(mb)

	return client, cleanup, nil
}

// getExistingNetworkConnection returns the connection for a pre-existing network.
func getExistingNetworkConnection(ctx context.Context) (*ton.APIClient, error) {
	configURL := "http://localhost:8000/localhost.global.config.json"
	pool := liteclient.NewConnectionPool()
	pool.AddConnectionsFromConfigUrl(ctx, configURL)
	return ton.NewAPIClient(pool, ton.ProofCheckPolicyFast), nil
}

// createNewNetwork provisions a new, temporary TON network for the test's duration.
// It handles port allocation and automatic container cleanup.
func createNewNetwork(ctx context.Context, chainID uint64, port int) (client *ton.APIClient, cleanup func(), err error) {
	// port := freeport.GetOne(t)
	bcInput := &blockchain.Input{
		ChainID: strconv.FormatUint(chainID, 10),
		Type:    "ton",
		Port:    strconv.Itoa(port),
		Image:   "ghcr.io/neodix42/mylocalton-docker:v3.7",
		CustomEnv: map[string]string{
			"NEXT_BLOCK_GENERATION_DELAY":    "0.5",
			"EMBEDDED_FILE_HTTP_SERVER":      "true",
			"EMBEDDED_FILE_HTTP_SERVER_PORT": strconv.Itoa(port),
		},
	}

	bcOut, err := blockchain.NewBlockchainNetwork(bcInput)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create blockchain network: %w", err)
	}

	// The cleanup function ensures the temporary network is terminated after the test.
	cleanup = func() {
		if bcOut.Container != nil && bcOut.Container.IsRunning() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if cterr := bcOut.Container.Terminate(ctx); cterr != nil {
				fmt.Printf("Container termination failed: %v", cterr)
			}
		}
		freeport.Return([]int{port})
	}

	connectionPool, cerr := tonchain.CreateLiteserverConnectionPool(ctx, bcOut.Nodes[0].ExternalHTTPUrl)
	if cerr != nil {
		return nil, nil, fmt.Errorf("failed to create connection pool from liteserver URL: %w", cerr)
	}

	client = ton.NewAPIClient(connectionPool, ton.ProofCheckPolicyFast)
	return client, cleanup, nil
}

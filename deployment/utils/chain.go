package utils //nolint:revive,nolintlint // TODO: update to meaningful package name

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf_provider "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton/provider"

	"github.com/smartcontractkit/chainlink-ton/deployment/config"
	tonchainpkg "github.com/smartcontractkit/chainlink-ton/pkg/ton/chain"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// Deprecated: use tvm.NewRandomTestWallet instead
func CreateRandomWallet(client ton.APIClientWrapped, version wallet.VersionConfig, option wallet.Option) (*wallet.Wallet, error) {
	return tvm.NewRandomTestWallet(client, version, option)
}

// Deprecated: use tvm.NewRandomHighloadV3TestWallet instead
func CreateRandomHighloadWallet(client ton.APIClientWrapped) (*wallet.Wallet, error) {
	return tvm.NewRandomHighloadV3TestWallet(client)
}

// Deprecated: use tvm.MyLocalTONWalletDefault instead
func GetLocalnetFunderWallet(client ton.APIClientWrapped) (*wallet.Wallet, error) {
	return tvm.MyLocalTONWalletDefault(client)
}

func FundWallets(t *testing.T, client ton.APIClientWrapped, recipients []*address.Address, amounts []tlb.Coins) error {
	return FundWalletsWithCtx(t.Context(), client, recipients, amounts)
}

func FundWalletsNoT(client ton.APIClientWrapped, recipients []*address.Address, amounts []tlb.Coins) error {
	return FundWalletsWithCtx(context.Background(), client, recipients, amounts)
}

func FundWalletsWithCtx(ctx context.Context, client ton.APIClientWrapped, recipients []*address.Address, amounts []tlb.Coins) error {
	funder, err := GetLocalnetFunderWallet(client)
	if err != nil {
		return fmt.Errorf("failed to get prefunded wallet: %w", err)
	}

	if len(recipients) != len(amounts) {
		return fmt.Errorf("number of recipients (%d) does not match number of amounts (%d)", len(recipients), len(amounts))
	}

	messages := make([]*wallet.Message, len(recipients))
	for i, addr := range recipients {
		transfer, terr := funder.BuildTransfer(addr, amounts[i], false, "")
		if terr != nil {
			return fmt.Errorf("failed to build transfer for %s: %w", addr.String(), terr)
		}
		messages[i] = transfer
	}
	_, _, txerr := funder.SendManyWaitTransaction(ctx, messages)
	if txerr != nil {
		return fmt.Errorf("airdrop transaction failed: %w", txerr)
	}

	err = waitForAirdropCompletion(ctx, client, recipients, amounts, 120*time.Second)
	if err != nil {
		return fmt.Errorf("airdrop completion verification failed: %w", err)
	}
	fmt.Printf("✓ %d funded successfully\n", len(recipients))
	return nil
}

func waitForAirdropCompletion(ctx context.Context, client ton.APIClientWrapped, recipients []*address.Address, expectedAmounts []tlb.Coins, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// get initial balances
	initialBalances := make(map[string]tlb.Coins)
	currentBlock, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return fmt.Errorf("failed to get current block: %w", err)
	}
	for _, addr := range recipients {
		if acc, err := client.GetAccount(ctx, currentBlock, addr); err == nil {
			if acc.State != nil {
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

			// It seems that the fund message is processes before getting the initial state. If the wallet has the expected amount should be enough
			// expectedMin := tlb.MustFromNano(initialBalance.Nano().Add(initialBalance.Nano(), expectedAmount.Nano()), 9)
			expectedMin := expectedAmount

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
				return nil
			}
		case <-ctx.Done():
			return fmt.Errorf("airdrop timeout: %d/%d completed", count, len(recipients))
		}
	}
}

// StartChain creates a TON chain using the CLDF CTFChainProvider.
// The once parameter ensures CTF network is only initialized once across test suite.
func StartChain(t *testing.T, chainID uint64, once *sync.Once) (cldf_ton.Chain, error) {
	ctx := t.Context()
	// Note: CLDF creates V5R1 wallet by default, so we need to wait for airdrop completion(used in txm test)
	p := cldf_provider.NewCTFChainProvider(t, chainID, config.LocalNetworkConfig(once))

	chain, err := p.Initialize(ctx)
	if err != nil {
		return cldf_ton.Chain{}, fmt.Errorf("failed to initialize CTF chain provider: %w", err)
	}

	tonChain, ok := chain.(cldf_ton.Chain)
	if !ok {
		return cldf_ton.Chain{}, errors.New("expected chain to be cldf_ton.Chain")
	}

	// Wait for wallet to be ready before returning
	// CTFChainProvider funds the wallet but doesn't wait for confirmation,
	// which can cause "cannot load block" errors when immediately using the wallet
	err = waitForAirdropCompletion(ctx, tonChain.Client, []*address.Address{tonChain.WalletAddress}, []tlb.Coins{tlb.MustFromTON("1000")}, 120*time.Second)
	if err != nil {
		return cldf_ton.Chain{}, fmt.Errorf("airdrop completion verification failed: %w", err)
	}
	t.Logf("TON chain started and funded wallet: %s", tonChain.WalletAddress.String())

	return tonChain, nil
}

func CreateClient(ctx context.Context, url string) (*ton.APIClient, error) {
	var client *ton.APIClient
	if strings.HasPrefix(url, "liteserver://") {
		pool, err := tonchainpkg.CreateLiteserverConnectionPool(ctx, url)
		if err != nil {
			return nil, fmt.Errorf("failed to create liteserver connection pool: %w", err)
		}
		client = ton.NewAPIClient(pool, ton.ProofCheckPolicyFast)
	} else {
		// connect via config URL
		cfg, err := liteclient.GetConfigFromUrl(ctx, url)
		if err != nil {
			return nil, fmt.Errorf("failed to get TON config: %w", err)
		}
		pool := liteclient.NewConnectionPool()
		err = pool.AddConnectionsFromConfig(ctx, cfg)
		if err != nil {
			return nil, fmt.Errorf("failed to connect to TON: %w", err)
		}
		client = ton.NewAPIClient(pool, ton.ProofCheckPolicyFast)
	}
	return client, nil
}

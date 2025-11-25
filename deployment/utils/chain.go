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
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf_provider "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton/provider"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"

	"github.com/smartcontractkit/chainlink-ton/deployment/config"
)

func CreateRandomWallet(client ton.APIClientWrapped, version wallet.VersionConfig, option wallet.Option) (*wallet.Wallet, error) {
	seed := wallet.NewSeed()
	rw, err := wallet.FromSeed(client, seed, version)
	if err != nil {
		return nil, fmt.Errorf("failed to generate random wallet: %w", err)
	}
	pw, perr := wallet.FromPrivateKeyWithOptions(client, rw.PrivateKey(), version, option)
	if perr != nil {
		return nil, fmt.Errorf("failed to generate random wallet: %w", perr)
	}
	return pw, nil
}

func CreateRandomHighloadWallet(client ton.APIClientWrapped) (*wallet.Wallet, error) {
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
	if err != nil {
		return nil, fmt.Errorf("failed to generate random wallet: %w", err)
	}
	return w, nil
}

// NOTE: Prefunded high-load wallet from MyLocalTon pre-funded wallet, that can send up to 254 messages per 1 external message
// https://docs.ton.org/v3/documentation/smart-contracts/contracts-specs/highload-wallet#highload-wallet-v2
func GetLocalnetFunderWallet(client ton.APIClientWrapped) (*wallet.Wallet, error) {
	walletVersion := wallet.HighloadV2Verified //nolint:staticcheck // only option in mylocalton-docker
	rawHlWallet, err := wallet.FromSeed(client, strings.Fields(blockchain.DefaultTonHlWalletMnemonic), walletVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to create highload wallet: %w", err)
	}
	mcFunderWallet, err := wallet.FromPrivateKeyWithOptions(client, rawHlWallet.PrivateKey(), walletVersion, wallet.WithWorkchain(-1))
	if err != nil {
		return nil, fmt.Errorf("failed to create highload wallet: %w", err)
	}
	subWalletID := uint32(42)
	funder, err := mcFunderWallet.GetSubwallet(subWalletID)
	if err != nil {
		return nil, fmt.Errorf("failed to get highload subwallet: %w", err)
	}
	// confirm the funder address
	if funder.Address().StringRaw() != blockchain.DefaultTonHlWalletAddress {
		return nil, errors.New("funder address mismatch")
	}
	return funder, nil
}

func FundWallets(t *testing.T, client ton.APIClientWrapped, recipients []*address.Address, amounts []tlb.Coins) error {
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
	_, _, txerr := funder.SendManyWaitTransaction(t.Context(), messages)
	if txerr != nil {
		return fmt.Errorf("airdrop transaction failed: %w", txerr)
	}

	err = waitForAirdropCompletion(t.Context(), client, recipients, amounts, 120*time.Second)
	if err != nil {
		return fmt.Errorf("airdrop completion verification failed: %w", err)
	}
	t.Logf("✓ %d funded successfully", len(recipients))
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

package monitor

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/monitoring/balance"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/smartcontractkit/chainlink-common/pkg/types/core"

	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
)

// BalanceMonitorOpts contains the options for creating a new TON account balance monitor.
type BalanceMonitorOpts struct {
	ChainInfo balance.ChainInfo

	Config    balance.GenericBalanceConfig
	Logger    logger.Logger
	Keystore  core.Keystore
	NewClient func(context.Context) (*ton.APIClient, error)
}

// NewBalanceMonitor returns a balance monitoring services.Service which reports balance of all Keystore accounts.
func NewBalanceMonitor(opts BalanceMonitorOpts) (services.Service, error) {
	return balance.NewGenericBalanceMonitor(balance.GenericBalanceMonitorOpts{
		ChainInfo:           opts.ChainInfo,
		ChainNativeCurrency: "TON",

		Config:   opts.Config,
		Logger:   opts.Logger,
		Keystore: opts.Keystore,
		NewGenericBalanceClient: func() (balance.GenericBalanceClient, error) {
			client, err := opts.NewClient(context.Background())
			if err != nil {
				return nil, fmt.Errorf("failed to get new client: %w", err)
			}
			return balanceClient{client}, nil
		},
		KeyToAccountMapper: func(ctx context.Context, pk string) (string, error) {
			// We need to convert the TON hex-encoded ed25519 public key to a wallet address
			return hexPublicKeyToWalletAddress(pk)
		},
	})
}

// TON balance reader client implementation
type balanceClient struct {
	client *ton.APIClient
}

// NewBalanceClient creates a balance client for testing purposes.
func NewBalanceClient(client *ton.APIClient) balance.GenericBalanceClient {
	return balanceClient{client: client}
}

// GetAccountBalance returns the account balance of addrString in TON.
func (c balanceClient) GetAccountBalance(addrString string) (float64, error) {
	ctx := context.Background()

	block, err := c.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return -1, fmt.Errorf("failed to get masterchain info: %w", err)
	}

	addr, err := address.ParseAddr(addrString)
	if err != nil {
		return -1, fmt.Errorf("failed to parse address [%s]: %w", addrString, err)
	}

	acc, err := c.client.GetAccount(ctx, block, addr)
	if err != nil {
		return -1, fmt.Errorf("failed to get account: %w", err)
	}

	// If account is not active, balance is 0
	if !acc.IsActive || acc.State == nil {
		return 0.0, nil
	}

	// Get the account balance in nanoTON (10^-9 TON) and convert to TON
	bal := acc.State.Balance.Nano()
	return nanoTONtoTON(bal), nil
}

// Convert nanoTON to TON as 1/10^9 TON
func nanoTONtoTON(nanoTON *big.Int) float64 {
	tonFloat := new(big.Float).Quo(new(big.Float).SetInt(nanoTON), new(big.Float).SetInt64(1e9))
	result, _ := tonFloat.Float64()
	return result
}

// DecodeHexPublicKey decodes a hex-encoded ed25519 public key and validates its size.
func DecodeHexPublicKey(hexPubKey string) (ed25519.PublicKey, error) {
	pubKeyBytes, err := hex.DecodeString(hexPubKey)
	if err != nil {
		return nil, fmt.Errorf("invalid hex-encoded public key: %w", err)
	}

	if len(pubKeyBytes) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("invalid public key size: expected %d bytes, got %d", ed25519.PublicKeySize, len(pubKeyBytes))
	}

	return ed25519.PublicKey(pubKeyBytes), nil
}

// hexPublicKeyToWalletAddress converts a hex-encoded ed25519 public key to a TON wallet address string.
// This should remain a pure cryptographic operation that doesn't require a blockchain client.
func hexPublicKeyToWalletAddress(hexPubKey string) (string, error) {
	pubKey, err := DecodeHexPublicKey(hexPubKey)
	if err != nil {
		return "", err
	}

	// Derive the wallet address directly from the public key
	// Use DefaultSubwallet to match what wallet.FromSigner() uses for HighloadV3 wallets
	// See: tonutils-go/ton/wallet/wallet.go newWallet() - HighloadV3 uses DefaultSubwallet
	addr, err := wallet.AddressFromPubKey(pubKey, tonconfig.WalletVersion, wallet.DefaultSubwallet)
	if err != nil {
		return "", fmt.Errorf("failed to derive wallet address from public key: %w", err)
	}

	return addr.String(), nil
}

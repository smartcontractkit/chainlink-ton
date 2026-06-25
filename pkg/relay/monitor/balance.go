package monitor

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"fmt"
	"math/big"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	clcommonbalance "github.com/smartcontractkit/chainlink-common/pkg/monitoring/balance"
	"github.com/smartcontractkit/chainlink-common/pkg/timeutil"

	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/smartcontractkit/chainlink-common/pkg/types/core"
	"github.com/smartcontractkit/chainlink-framework/metrics"

	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
)

// BalanceMonitorOpts contains the options for creating a new TON account balance monitor.
type BalanceMonitorOpts struct {
	ChainInfo clcommonbalance.ChainInfo

	Config    clcommonbalance.GenericBalanceConfig
	Logger    logger.Logger
	Keystore  core.Keystore
	NewClient func(context.Context) (ton.APIClientWrapped, error)
}

// TODO: Add TON to metrics
const TON = "TON"

// NewBalanceMonitor returns a balance monitoring services.Service which reports balance of all Keystore accounts.
func NewBalanceMonitor(opts BalanceMonitorOpts) (services.Service, error) {
	balanceMetrics, err := metrics.NewGenericBalanceMetrics(TON, opts.ChainInfo.ChainID)
	if err != nil {
		return nil, fmt.Errorf("failed to create balance metrics: %w", err)
	}
	clCommonBalanceMetrics, err := clcommonbalance.NewGaugeAccBalance(TON)
	if err != nil {
		return nil, fmt.Errorf("failed to create old balance metrics: %w", err)
	}
	return &balanceMonitor{
		ChainID:             opts.ChainInfo.ChainID,
		ChainNativeCurrency: TON,

		Config:   opts.Config,
		Logger:   opts.Logger,
		Keystore: opts.Keystore,

		ChainInfo:              opts.ChainInfo,
		CLCommonBalanceMetrics: clCommonBalanceMetrics,

		CLFrameworkBalanceMetrics: balanceMetrics,
		NewClient: func(ctx context.Context) (ton.APIClientWrapped, error) {
			client, err := opts.NewClient(ctx)
			if err != nil {
				return nil, fmt.Errorf("failed to get new client: %w", err)
			}
			return client, nil
		},
		Stop: make(services.StopChan),
		Done: make(chan struct{}),
	}, nil
}

type balanceMonitor struct {
	services.StateMachine
	ChainID             string
	ChainNativeCurrency string
	Config              clcommonbalance.GenericBalanceConfig
	Logger              logger.Logger
	Keystore            core.Keystore

	ChainInfo clcommonbalance.ChainInfo // Should be migrated to receive ChainID directly
	// Deprecated: OldBalanceMetrics is the old gauge metric for account balance, which is being replaced by BalanceMetrics. It will be removed in a future release after ensuring all metrics are migrated and stable.
	CLCommonBalanceMetrics *clcommonbalance.GaugeAccBalance

	/// BalanceMetrics uses chainlink-framework and is meant to replace the old GenericBalanceMonitor.

	CLFrameworkBalanceMetrics metrics.GenericBalanceMetrics
	NewClient                 func(ctx context.Context) (ton.APIClientWrapped, error)

	Stop services.StopChan
	Done chan struct{}
}

var _ services.Service = (*balanceMonitor)(nil)

func (b *balanceMonitor) Name() string {
	return b.Logger.Name()
}

func (b *balanceMonitor) Start(context.Context) error {
	return b.StartOnce("BalanceMonitor", func() error {
		go b.monitor()
		return nil
	})
}

func (b *balanceMonitor) Close() error {
	return b.StopOnce("BalanceMonitor", func() error {
		close(b.Stop)
		<-b.Done
		return nil
	})
}

func (b *balanceMonitor) HealthReport() map[string]error {
	return map[string]error{b.Name(): b.Healthy()}
}

func (b *balanceMonitor) monitor() {
	defer close(b.Done)
	ctx, cancel := b.Stop.NewCtx()
	defer cancel()

	ticker := timeutil.NewTicker(func() time.Duration { return b.Config.BalancePollPeriod.Duration() })
	defer ticker.Stop()
	for {
		select {
		case <-b.Stop:
			return
		case <-ticker.C:
			b.updateBalances(ctx)
			ticker.Reset()
		}
	}
}

func (b *balanceMonitor) updateBalances(ctx context.Context) {
	ctx, cancel := b.Stop.Ctx(ctx)
	defer cancel()

	pks, err := b.Keystore.Accounts(ctx)
	if err != nil {
		b.Logger.Errorw("Failed to get keys", "err", err)
		return
	}
	if len(pks) == 0 {
		return
	}
	client, err := b.NewClient(ctx)
	if err != nil {
		b.Logger.Errorw("Failed to create client", "err", err)
		return
	}
	for _, pk := range pks {
		addr, err := hexPublicKeyToWalletAddress(pk)
		if err != nil {
			b.Logger.Errorw("Failed to derive wallet address from public key", "err", err, "publicKey", pk)
			continue
		}
		// Check for shutdown signal, since Balance blocks and may be slow.
		select {
		case <-ctx.Done():
			return
		default:
		}
		tons, err := GetAccountBalance(ctx, client, addr)
		if err != nil {
			b.Logger.Errorw("Failed to get balance", "account", addr, "err", err)
			continue
		}
		b.SendMetric(ctx, addr, tons)
	}
}

// GetAccountBalance returns the account balance of addrString in TON.
func GetAccountBalance(ctx context.Context, client ton.APIClientWrapped, addrString string) (float64, error) {
	ctx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()

	block, err := client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return -1, fmt.Errorf("failed to get masterchain info: %w", err)
	}

	addr, err := address.ParseAddr(addrString)
	if err != nil {
		return -1, fmt.Errorf("failed to parse address [%s]: %w", addrString, err)
	}

	acc, err := client.WaitForBlock(block.SeqNo).GetAccount(ctx, block, addr)
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

func (b *balanceMonitor) SendMetric(ctx context.Context, account string, balance float64) {
	b.CLFrameworkBalanceMetrics.RecordNodeBalance(ctx, account, balance)

	// TODO remove after migration to new metrics is complete and stable
	b.CLCommonBalanceMetrics.Record(ctx, balance, account, b.ChainInfo)

	b.Logger.Debugw("Account balance updated", "unit", b.ChainNativeCurrency, "account", account, "balance", balance)
}

package relay

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"math/rand/v2"
	"strconv"
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/chains"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-common/pkg/loop"
	"github.com/smartcontractkit/chainlink-common/pkg/services"
	"github.com/smartcontractkit/chainlink-common/pkg/sqlutil"
	commontypes "github.com/smartcontractkit/chainlink-common/pkg/types"
	"github.com/smartcontractkit/chainlink-common/pkg/types/core"
	commonutils "github.com/smartcontractkit/chainlink-common/pkg/utils"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/chainlink-ton/pkg/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/fees"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

type Chain interface {
	commontypes.ChainService

	ID() string
	TxManager() TxManager
	LogPoller() logpoller.Service
	GetClient(ctx context.Context) (*ton.APIClient, error)
}

type ChainOpts struct {
	Logger   logger.Logger
	KeyStore core.Keystore
	DS       sqlutil.DataSource
}

var _ Chain = (*chain)(nil)

type cachedClient struct {
	client    *ton.APIClient
	timestamp time.Time
}

type chain struct {
	services.StateMachine
	starter commonutils.StartStopOnce

	id   string
	cfg  *config.TOMLConfig
	lggr logger.Logger
	ds   sqlutil.DataSource

	txm *txm.Txm
	lp  logpoller.Service

	clientCache map[int]*cachedClient
	cacheMu     sync.RWMutex
}

func NewChain(cfg *config.TOMLConfig, opts ChainOpts) (Chain, error) {
	if !cfg.IsEnabled() {
		return nil, fmt.Errorf("cannot create new chain with ID %s: chain is disabled", cfg.ChainID)
	}

	return newChain(context.Background(), cfg, opts.KeyStore, opts.Logger, opts.DS)
}

func newChain(ctx context.Context, cfg *config.TOMLConfig, loopKs loop.Keystore, lggr logger.Logger, ds sqlutil.DataSource) (*chain, error) {
	lggr = logger.With(lggr, "chainID", cfg.ChainID)

	// TEMP: fetch the first account in the store to use for transmissions to avoid having to specify it in TOML
	accounts, err := loopKs.Accounts(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch accounts from keystore: %w", err)
	}

	if len(accounts) == 0 {
		return nil, errors.New("no TON account available")
	}

	_, err = strconv.ParseInt(cfg.ChainID, 10, 8)
	if err != nil {
		return nil, fmt.Errorf("invalid chain ID %s: could not parse as an integer: %w", cfg.ChainID, err)
	}

	ch := &chain{
		id:   cfg.ChainID,
		cfg:  cfg,
		lggr: logger.Named(lggr, "Chain"),
		ds:   ds,
	}

	tonClient, err := ch.GetClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create TON client for chain ID %s: %w", cfg.ChainID, err)
	}

	signerWallet, err := ch.GetSignerWallet(ctx, tonClient, loopKs, 0)
	if err != nil {
		return nil, fmt.Errorf("failed to get signer wallet for chain ID %s: %w", cfg.ChainID, err)
	}

	apiClient := tracetracking.SignedAPIClient{
		Client: tonClient,
		Wallet: *signerWallet,
	}

	txmCfg := txm.DefaultConfigSet
	ch.txm = txm.New(lggr, loopKs, apiClient, txmCfg)

	// TODO: Setup accounts balance monitor

	return ch, nil
}

func (c *chain) Name() string {
	return c.lggr.Name()
}

func (c *chain) Start(ctx context.Context) error {
	return c.starter.StartOnce("Chain", func() error {
		c.lggr.Debug("Starting")
		c.lggr.Debug("Starting txm")

		var ms services.MultiStart
		return ms.Start(ctx, c.txm)
	})
}

func (c *chain) Close() error {
	return c.starter.StopOnce("Chain", func() error {
		c.lggr.Debug("Stopping")
		c.lggr.Debug("Stopping txm")
		return services.CloseAll(c.txm)
	})
}

func (c *chain) Ready() error {
	return errors.Join(c.starter.Ready(), c.txm.Ready())
}

func (c *chain) HealthReport() map[string]error {
	report := map[string]error{c.Name(): c.starter.Healthy()}
	services.CopyHealth(report, c.txm.HealthReport())
	// TODO: Add balance monitor health report once implemented
	return report
}

func (c *chain) LatestHead(ctx context.Context) (commontypes.Head, error) {
	client, err := c.GetClient(ctx)
	if err != nil {
		return commontypes.Head{}, fmt.Errorf("failed to get client: %w", err)
	}

	// Get the latest masterchain block ID
	blockID, err := client.GetMasterchainInfo(ctx)
	if err != nil {
		return commontypes.Head{}, fmt.Errorf("failed to get masterchain info: %w", err)
	}

	// Load the full block to get timestamp and hash
	block, err := client.GetBlockData(ctx, blockID)
	if err != nil {
		return commontypes.Head{}, fmt.Errorf("failed to get block data: %w", err)
	}

	return commontypes.Head{
		Hash:      blockID.RootHash,
		Height:    strconv.FormatUint(uint64(blockID.SeqNo), 10),
		Timestamp: uint64(block.BlockInfo.GenUtime),
	}, nil
}

func (c *chain) GetChainInfo(_ context.Context) (commontypes.ChainInfo, error) {
	chainID := c.cfg.ChainID

	// Check if chain ID is an integer
	id, err := strconv.ParseInt(chainID, 10, 32)
	if err != nil {
		return commontypes.ChainInfo{}, fmt.Errorf("chainID '%s' must be a valid int32: %w", chainID, err)
	}

	networkName, err := chainsel.TonNameFromChainId(int32(id))
	if err != nil {
		return commontypes.ChainInfo{}, fmt.Errorf("failed to get network name from chain ID: %s, err: %w", c.id, err)
	}

	return commontypes.ChainInfo{
		FamilyName:      "ton",
		ChainID:         chainID,
		NetworkName:     networkName,
		NetworkNameFull: networkName,
	}, nil
}

func (c *chain) GetChainStatus(ctx context.Context) (commontypes.ChainStatus, error) {
	toml, err := c.cfg.TOMLString()
	if err != nil {
		return commontypes.ChainStatus{}, err
	}
	return commontypes.ChainStatus{
		ID:      c.id,
		Enabled: c.cfg.IsEnabled(),
		Config:  toml,
	}, nil
}

func (c *chain) ListNodeStatuses(ctx context.Context, pageSize int32, pageToken string) (stats []commontypes.NodeStatus, nextPageToken string, total int, err error) {
	return chains.ListNodeStatuses(int(pageSize), pageToken, c.listNodeStatuses)
}

func (c *chain) Transact(ctx context.Context, from, to string, amount *big.Int, balanceCheck bool) error {
	// TODO(NONEVM-1460): implement
	return errors.ErrUnsupported
}

func (c *chain) Replay(ctx context.Context, fromBlock string, args map[string]any) error {
	// TODO(NONEVM-1460): implement
	return errors.ErrUnsupported
}

func (c *chain) ID() string {
	return c.id
}

func (c *chain) TxManager() TxManager {
	return c.txm
}

func (c *chain) FeeEstimator() fees.Estimator {
	// TODO(NONEVM-1460): implement
	return nil
}

func (c *chain) LogPoller() logpoller.Service {
	return c.lp
}

func (c *chain) ChainID() string {
	return c.id
}

// GetClient returns a client, randomly selecting one from available and valid nodes
func (c *chain) GetClient(ctx context.Context) (*ton.APIClient, error) {
	var lastErr error
	nodes := c.cfg.Nodes
	if len(nodes) == 0 {
		return nil, errors.New("no nodes available")
	}

	indexes := rand.Perm(len(nodes))

	for _, i := range indexes {
		node := nodes[i]

		// Check cache
		c.cacheMu.RLock()
		entry, ok := c.clientCache[i]
		c.cacheMu.RUnlock()

		if ok && time.Since(entry.timestamp) < c.cfg.ClientTTL {
			c.lggr.Debugw("Using cached client", "name", node.Name, "url", node.URL)
			return entry.client, nil
		} else if ok {
			// TTL expired — evict
			c.lggr.Debugw("Evicting expired client", "name", node.Name)
			c.cacheMu.Lock()
			delete(c.clientCache, i)
			c.cacheMu.Unlock()
		}

		// Build new client
		configURL := node.URL.String()
		tonCfg, err := liteclient.GetConfigFromUrl(ctx, configURL)
		if err != nil {
			c.lggr.Warnw("failed to fetch TON config", "name", node.Name, "ton-url", node.URL, "err", err)
			continue
		}

		connectionPool := liteclient.NewConnectionPool()
		err = connectionPool.AddConnectionsFromConfig(ctx, tonCfg)
		if err != nil {
			lastErr = err
			c.lggr.Warnw("failed to connect", "name", node.Name, "ton-url", node.URL, "err", err)
			continue
		}

		client := ton.NewAPIClient(connectionPool, ton.ProofCheckPolicyFast)
		client.SetTrustedBlockFromConfig(tonCfg)

		blockID, err := client.CurrentMasterchainInfo(ctx)
		if err != nil {
			lastErr = err
			c.evictClient(i, *node.Name, "CurrentMasterchainInfo failed")
			continue
		}

		block, err := client.GetBlockData(ctx, blockID)
		if err != nil {
			lastErr = err
			c.evictClient(i, *node.Name, "GetBlockData failed")
			continue
		}

		chainID := block.GlobalID
		if strconv.FormatInt(int64(chainID), 10) != c.id {
			c.lggr.Errorw("unexpected chain id", "name", node.Name, "localChainId", c.id, "remoteChainId", chainID)
			continue
		}

		// Cache the fresh client
		c.cacheMu.Lock()
		c.clientCache[i] = &cachedClient{
			client:    client,
			timestamp: time.Now(),
		}
		c.cacheMu.Unlock()

		c.lggr.Debugw("Created and cached client", "name", node.Name, "url", node.URL)
		return client, nil
	}

	return nil, fmt.Errorf("no valid TON nodes available, last error: %w", lastErr)
}

func (c *chain) GetSignerWallet(ctx context.Context, client *ton.APIClient, loopKs loop.Keystore, accountIndex int) (*wallet.Wallet, error) {
	accounts, err := loopKs.Accounts(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list accounts: %w", err)
	}

	if len(accounts) == 0 {
		return nil, errors.New("no accounts available in keystore")
	}

	if accountIndex < 0 || accountIndex >= len(accounts) {
		return nil, fmt.Errorf("account index %d out of range, only %d accounts available", accountIndex, len(accounts))
	}
	account := accounts[accountIndex]

	// Decode the account string as a hex-encoded ed25519 public key
	pubKeyBytes, err := hex.DecodeString(account)
	if err != nil {
		return nil, fmt.Errorf("invalid account hex string: %w", err)
	}
	if len(pubKeyBytes) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("invalid public key size: %d", len(pubKeyBytes))
	}
	pubKey := ed25519.PublicKey(pubKeyBytes)

	// Wrap your loopKs.Sign into a compatible signer function
	signer := func(ctx context.Context, toSign *cell.Cell, subwallet uint32) ([]byte, error) {
		boc := toSign.ToBOC()
		return loopKs.Sign(ctx, account, boc)
	}

	// Create the wallet from public key + signer wrapper
	w, err := wallet.FromSigner(client, pubKey, tonconfig.WalletVersion, signer)
	if err != nil {
		return nil, fmt.Errorf("failed to create wallet: %w", err)
	}

	return w, nil
}

func (c *chain) evictClient(index int, name string, reason string) {
	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()
	delete(c.clientCache, index)
	c.lggr.Warnw("evicted client due to error", "name", name, "reason", reason)
}

func (c *chain) listNodeStatuses(start, end int) ([]commontypes.NodeStatus, int, error) {
	stats := make([]commontypes.NodeStatus, 0)
	total := len(c.cfg.Nodes)
	if start >= total {
		return stats, total, chains.ErrOutOfRange
	}
	if end > total {
		end = total
	}
	nodes := c.cfg.Nodes[start:end]
	for _, node := range nodes {
		stat, err := config.NodeStatus(node, c.ChainID())
		if err != nil {
			return stats, total, err
		}
		stats = append(stats, stat)
	}
	return stats, total, nil
}

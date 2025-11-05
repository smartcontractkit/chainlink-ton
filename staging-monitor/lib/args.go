package lib

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
)

var loadEnvOnce sync.Once

// Client interface - CLEAN, no chain selector params!
type Client interface {
	ChainSelector() uint64
	// SendMessage sends to router, returns result
	SendMessage(ctx context.Context, lggr logger.Logger, msg MessageToSend) (*SendResult, error)
	// WaitForMessageReceived polls for message receipt starting from given block
	WaitForMessageReceived(ctx context.Context, lggr logger.Logger, receiver string, messageID string, expectedData string, startBlock uint64) error
	// GetCurrentBlock returns the current block number
	GetCurrentBlock(ctx context.Context) (uint64, error)
	// GetBalance returns the balance of the given address
	GetBalance(ctx context.Context, address string) (string, error)
	// GetWalletAddress returns the wallet address if initialized, or error
	GetWalletAddress() (string, error)
}

// MessageToSend contains all params needed to send a CCIP message
type MessageToSend struct {
	Router       string
	Receiver     string
	DestChainSel uint64
	Data         []byte
}

// ClientFactory creates a Client
type ClientFactory func(
	ctx context.Context,
	lggr logger.Logger,
	chainSel uint64,
	endpoint string,
	walletKey string,
) (Client, error)

var clientFactories = make(map[string]ClientFactory)

func RegisterClientFactory(family string, factory ClientFactory) {
	clientFactories[family] = factory
}

func GetClientFactory(family string) (ClientFactory, bool) {
	factory, ok := clientFactories[family]
	return factory, ok
}

// TestArgs holds test configuration
type TestArgs struct {
	SrcChainSel  uint64 // Source chain selector (for SetupContext)
	DestChainSel uint64 // Destination chain selector (for SendMessage)

	SrcRouter    string
	SrcWalletKey string
	SrcEndpoint  string

	DestReceiver string
	DestEndpoint string

	MessageData string
}

// TestContext holds args and clients - PROVIDES ORCHESTRATION
type TestContext struct {
	Args   TestArgs
	Source Client
	Dest   Client
}

// SendResult from SendMessage
type SendResult struct {
	SeqNum    uint64
	MessageID string // hex, no 0x prefix
	TxHash    string // hex, no 0x prefix // TODO: currently empty for TON, populate
	BlockNum  uint64
}

func (tc *TestContext) SendMessage(ctx context.Context, lggr logger.Logger, data []byte) (*SendResult, error) {
	msg := MessageToSend{
		Router:       tc.Args.SrcRouter,
		Receiver:     tc.Args.DestReceiver,
		DestChainSel: tc.Args.DestChainSel,
		Data:         data,
	}
	return tc.Source.SendMessage(ctx, lggr, msg)
}

// Captures starting block BEFORE message is processed, then waits for it
func (tc *TestContext) WaitForMessageReceived(ctx context.Context, lggr logger.Logger, messageID string, expectedData string, startBlock uint64) error {
	return tc.Dest.WaitForMessageReceived(ctx, lggr, tc.Args.DestReceiver, messageID, expectedData, startBlock)
}

func TryLoadEnvFile() {
	// Load .env file once (for local testing)
	loadEnvOnce.Do(func() {
		envPath := filepath.Join(".", ".env")
		if err := godotenv.Load(envPath); err != nil {
			// Silently ignore if .env doesn't exist (CI will use environment variables)
			if !os.IsNotExist(err) {
				fmt.Printf("Warning: failed to load .env file: %v", err)
			}
		}
	})
}

// LoadArgs loads configuration from env
func LoadArgs(srcChainSel, destChainSel uint64) (TestArgs, error) {
	srcChainName, err := GetChainName(srcChainSel)
	if err != nil {
		return TestArgs{}, fmt.Errorf("failed to get source chain name: %w", err)
	}
	destChainName, err := GetChainName(destChainSel)
	if err != nil {
		return TestArgs{}, fmt.Errorf("failed to get destination chain name: %w", err)
	}

	srcPrefix := normalizeChainName(srcChainName)
	destPrefix := normalizeChainName(destChainName)

	return TestArgs{
		SrcChainSel:  srcChainSel,
		DestChainSel: destChainSel,
		SrcRouter:    mustGetEnv(srcPrefix + "_ROUTER"),
		SrcWalletKey: mustGetEnv(srcPrefix + "_WALLET_KEY"),
		SrcEndpoint:  mustGetEnv(srcPrefix + "_ENDPOINT"),
		DestReceiver: mustGetEnv(destPrefix + "_RECEIVER"),
		DestEndpoint: mustGetEnv(destPrefix + "_ENDPOINT"),
		MessageData:  getEnvOrDefault("MESSAGE", "CCIP staging test "+time.Now().UTC().Format("15:04")),
	}, nil
}

func GetChainName(chainSel uint64) (string, error) {
	chainID, err := chainsel.GetChainIDFromSelector(chainSel)
	if err != nil {
		return "", fmt.Errorf("failed to get chain ID from selector %d: %w", chainSel, err)
	}

	family, err := chainsel.GetSelectorFamily(chainSel)
	if err != nil {
		return "", fmt.Errorf("failed to get chain family from selector %d: %w", chainSel, err)
	}

	chainDetails, err := chainsel.GetChainDetailsByChainIDAndFamily(chainID, family)
	if err != nil {
		return "", fmt.Errorf("failed to get chain details for chain ID %s and family %s: %w", chainID, family, err)
	}

	return chainDetails.ChainName, nil
}

func normalizeChainName(name string) string {
	name = strings.ToUpper(name)
	name = strings.ReplaceAll(name, " ", "_")
	name = strings.ReplaceAll(name, "-", "_")
	return name
}

// SetupContext creates clients from TestArgs
func SetupContext(ctx context.Context, lggr logger.Logger, args TestArgs) (*TestContext, error) {
	tc := &TestContext{Args: args}

	srcFamily, err := chainsel.GetSelectorFamily(args.SrcChainSel)
	if err != nil {
		return nil, fmt.Errorf("unknown source chain family: %w", err)
	}

	destFamily, err := chainsel.GetSelectorFamily(args.DestChainSel)
	if err != nil {
		return nil, fmt.Errorf("unknown dest chain family: %w", err)
	}

	srcFactory, ok := clientFactories[srcFamily]
	if !ok {
		return nil, fmt.Errorf("no factory for source chain family: %s", srcFamily)
	}

	destFactory, ok := clientFactories[destFamily]
	if !ok {
		return nil, fmt.Errorf("no factory for dest chain family: %s", destFamily)
	}

	tc.Source, err = srcFactory(ctx, lggr, args.SrcChainSel, args.SrcEndpoint, args.SrcWalletKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create source client: %w", err)
	}
	tc.Dest, err = destFactory(ctx, lggr, args.DestChainSel, args.DestEndpoint, "")
	if err != nil {
		return nil, fmt.Errorf("failed to create dest client: %w", err)
	}

	return tc, nil
}

func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Errorf("%s not set", key))
	}
	return v
}

func getEnvOrDefault(key, defaultValue string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultValue
}

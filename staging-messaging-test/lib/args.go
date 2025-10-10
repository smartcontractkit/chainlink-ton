package lib

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/joho/godotenv"
	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/stretchr/testify/require"
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
	t *testing.T,
	ctx context.Context,
	lggr logger.Logger,
	chainSel uint64,
	endpoint string,
	walletKey string,
) Client

var clientFactories = make(map[string]ClientFactory)

func RegisterClientFactory(family string, factory ClientFactory) {
	clientFactories[family] = factory
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
	// TODO: empty for TON, populate
	TxHash   string // hex, no 0x prefix
	BlockNum uint64
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

// LoadArgs loads configuration from env
func LoadArgs(t *testing.T, srcChainSel, destChainSel uint64) TestArgs {
	// Load .env file once (for local testing)
	loadEnvOnce.Do(func() {
		envPath := filepath.Join("..", ".env")
		if err := godotenv.Load(envPath); err != nil {
			// Silently ignore if .env doesn't exist (CI will use environment variables)
			if !os.IsNotExist(err) {
				t.Logf("Warning: failed to load .env file: %v", err)
			}
		}
	})

	srcChainName := getChainName(t, srcChainSel)
	destChainName := getChainName(t, destChainSel)

	srcPrefix := normalizeChainName(srcChainName)
	destPrefix := normalizeChainName(destChainName)

	return TestArgs{
		SrcChainSel:  srcChainSel,
		DestChainSel: destChainSel,
		SrcRouter:    getEnv(t, srcPrefix+"_ROUTER"),
		SrcWalletKey: getEnv(t, srcPrefix+"_WALLET_KEY"),
		SrcEndpoint:  getEnv(t, srcPrefix+"_ENDPOINT"),
		DestReceiver: getEnv(t, destPrefix+"_RECEIVER"),
		DestEndpoint: getEnv(t, destPrefix+"_ENDPOINT"),
		MessageData:  getEnvOrDefault("MESSAGE", fmt.Sprintf("CCIP staging test %s", time.Now().UTC().Format("15:04"))),
	}
}

func getChainName(t *testing.T, chainSel uint64) string {
	chainID, err := chainsel.GetChainIDFromSelector(chainSel)
	require.NoError(t, err, "failed to get chain ID from selector %d", chainSel)

	family, err := chainsel.GetSelectorFamily(chainSel)
	require.NoError(t, err, "failed to get chain family from selector %d", chainSel)

	chainDetails, err := chainsel.GetChainDetailsByChainIDAndFamily(chainID, family)
	require.NoError(t, err, "failed to get chain details for chain ID %s and family %s", chainID, family)

	return chainDetails.ChainName
}

func normalizeChainName(name string) string {
	name = strings.ToUpper(name)
	name = strings.ReplaceAll(name, " ", "_")
	name = strings.ReplaceAll(name, "-", "_")
	return name
}

// SetupContext creates clients from TestArgs
func SetupContext(ctx context.Context, t *testing.T, lggr logger.Logger, args TestArgs) *TestContext {
	tc := &TestContext{Args: args}

	srcFamily, err := chainsel.GetSelectorFamily(args.SrcChainSel)
	require.NoError(t, err, "unknown source chain family")

	destFamily, err := chainsel.GetSelectorFamily(args.DestChainSel)
	require.NoError(t, err, "unknown dest chain family")

	srcFactory, ok := clientFactories[srcFamily]
	require.True(t, ok, "no factory for source chain family: %s", srcFamily)

	destFactory, ok := clientFactories[destFamily]
	require.True(t, ok, "no factory for dest chain family: %s", destFamily)

	tc.Source = srcFactory(t, ctx, lggr, args.SrcChainSel, args.SrcEndpoint, args.SrcWalletKey)
	tc.Dest = destFactory(t, ctx, lggr, args.DestChainSel, args.DestEndpoint, "")

	return tc
}

func SetupLogger(t *testing.T) logger.Logger {
	lggr, err := logger.New()
	require.NoError(t, err, "failed to create logger")
	return lggr
}

func getEnv(t *testing.T, key string) string {
	v := os.Getenv(key)
	require.NotEmpty(t, v, "%s not set", key)
	return v
}

func getEnvOrDefault(key, defaultValue string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultValue
}

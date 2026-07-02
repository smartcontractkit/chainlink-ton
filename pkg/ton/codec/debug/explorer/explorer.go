package explorer

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/Masterminds/semver/v3"
	"github.com/spf13/cobra"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"go.uber.org/zap/zapcore"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/visualizations/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

func GenerateExplorerCmd(lggr *logger.Logger, contracts map[string]debug.TypeAndVersion, client *ton.APIClient) *cobra.Command {
	var (
		destAddressStr string
		txHashStr      string
		net            string
		verbose        bool
		pageSize       uint32
		maxPages       uint32
		visualization  string
		format         string
	)

	cmd := &cobra.Command{
		Use:   "explorer <tx-hash> <address> | <url>",
		Short: "TON blockchain explorer and trace analyzer",
		Long: `A command-line tool for exploring TON blockchain transactions and analyzing traces.
This tool helps debug and understand transaction flows on the TON network.

Usage:
  explorer <tx-hash> <address>  - Analyze transaction with address and hash
  explorer <url>                - Analyze transaction from URL

Arguments:
  address   Destination address in base64
  tx-hash   Transaction hash in hex
  url       tonscan TX URL`,
		Args: func(cmd *cobra.Command, args []string) error {
			if len(args) != 1 && len(args) != 2 {
				return errors.New("requires 1 argument (URL) or 2 arguments (<tx-hash> <address>)")
			}
			return nil
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			var err error
			var log logger.Logger
			if lggr != nil {
				log = *lggr
			} else {
				config := logger.Config{}
				if verbose {
					config.Level = zapcore.DebugLevel
				}
				log, err = config.New()
				if err != nil {
					return fmt.Errorf("failed to create logger: %w", err)
				}
			}
			if client != nil && cmd.Flags().Changed("net") {
				return errors.New("cannot specify network flag when using existing client")
			}
			var txHash, address, parsedNet string

			urlOrTx := args[0]
			var parseURLErr error
			txHash, address, parsedNet, parseURLErr = ParseURL(urlOrTx)
			if parseURLErr == nil {
				if cmd.Root().Flags().Changed("net") {
					return errors.New("cannot specify network flag when using URL")
				}
				net = parsedNet
			} else {
				// Not a URL, treat as tx-hash
				if len(urlOrTx) != 64 && (len(urlOrTx) != 66 || !strings.HasPrefix(urlOrTx, "0x")) {
					return fmt.Errorf("failed to parse URL: %w", parseURLErr)
				}

				_, err = hex.DecodeString(strings.TrimPrefix(urlOrTx, "0x"))
				if err != nil {
					return fmt.Errorf("invalid transaction hash or url: %w", err)
				}
				txHash = urlOrTx
			}

			if len(args) == 2 {
				address = args[1]
			}

			ctx := context.Background()
			client, err := Connect(log, client, net, verbose, pageSize, maxPages)
			if err != nil {
				return fmt.Errorf("failed to initialize explorer: %w", err)
			}
			explorerFormat, err := parseFormat(visualization, format)
			if err != nil {
				return fmt.Errorf("failed to parse format: %w", err)
			}
			err = client.PrintTrace(ctx, txHash, address, explorerFormat, contracts)
			if err != nil {
				return fmt.Errorf("failed to execute trace: %w", err)
			}
			return nil
		},
	}

	cmd.Flags().StringVarP(&destAddressStr, "address", "a", "", "Destination address in base64 (optional if provided as argument)")
	cmd.Flags().StringVarP(&visualization, "visualization", "V", "sequence", "Visualization format (sequence or tree)")
	cmd.Flags().StringVarP(&format, "format", "f", "", "Sequence visualization format (url or raw) (only for sequence visualization)")
	cmd.Flags().StringVarP(&txHashStr, "tx", "t", "", "Transaction hash in hex (optional if provided as argument)")
	cmd.Flags().StringVarP(&net, "net", "n", "testnet", "TON network (mainnet, testnet, mylocalton, or http://domain/x.global.config.json)")
	if lggr == nil {
		cmd.Flags().BoolVarP(&verbose, "verbose", "v", false, "Shows full body of unmatched messages")
	}
	cmd.Flags().Uint32VarP(&pageSize, "page-size", "s", 10, "Number of blocks to fetch per page")
	cmd.Flags().Uint32VarP(&maxPages, "max-pages", "p", 10, "Maximum number of pages to fetch")

	return cmd
}

func parseFormat(visualization string, format string) (Format, error) {
	switch visualization {
	case "tree":
		if format != "" {
			return Format(0), errors.New("format option is not applicable for tree visualization")
		}
		return FormatTree, nil
	case "sequence":
		switch format {
		case "", "url":
			return FormatSequenceURL, nil
		case "raw":
			return FormatSequenceRaw, nil
		}
		return Format(0), fmt.Errorf("invalid sequence format: %s", format)
	}
	return Format(0), fmt.Errorf("invalid visualization format: %s", format)
}

// ContainerInspect represents the structure returned by docker inspect
type ContainerInspect struct {
	ID    string `json:"Id"`
	State struct {
		Running bool `json:"Running"`
	} `json:"State"`
	Config struct {
		Image string `json:"Image"`
	} `json:"Config"`
	NetworkSettings struct {
		Ports map[string][]struct {
			HostIP   string `json:"HostIp"`
			HostPort string `json:"HostPort"`
		} `json:"Ports"`
	} `json:"NetworkSettings"`
}

// findMylocaltonContainer finds a running mylocalton container and returns its ID
func findMylocaltonContainer(ctx context.Context) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", "ps", "--format", "{{.ID}}\t{{.Image}}", "--filter", "status=running")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to list docker containers: %w", err)
	}

	lines := strings.SplitSeq(strings.TrimSpace(string(output)), "\n")
	for line := range lines {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) != 2 {
			continue
		}
		containerID := parts[0]
		image := parts[1]

		// Look for mylocalton containers, but exclude explorer
		if strings.Contains(image, "mylocalton-docker") && !strings.Contains(image, "mylocalton-docker-explorer") {
			return containerID, nil
		}
	}

	return "", errors.New("no running mylocalton container found")
}

// inspectContainer runs docker inspect on the given container ID
func inspectContainer(ctx context.Context, containerID string) (*ContainerInspect, error) {
	cmd := exec.CommandContext(ctx, "docker", "inspect", containerID)
	output, err := cmd.CombinedOutput()
	if err != nil {
		if strings.Contains(string(output), "No such object") || strings.Contains(string(output), "No such container") {
			return nil, fmt.Errorf("container %s does not exist", containerID)
		}
		return nil, fmt.Errorf("docker inspect failed: %w\nOutput: %s", err, string(output))
	}

	var inspects []ContainerInspect
	if err := json.Unmarshal(output, &inspects); err != nil {
		return nil, fmt.Errorf("failed to parse docker inspect output: %w", err)
	}

	if len(inspects) == 0 {
		return nil, fmt.Errorf("container %s not found", containerID)
	}

	inspect := &inspects[0]

	if !inspect.State.Running {
		return nil, fmt.Errorf("container %s exists but is not running", containerID)
	}

	return inspect, nil
}

// getPortMapping extracts the host port that maps to a given container port
func getPortMapping(inspect *ContainerInspect, containerPort string) (string, error) {
	portKey := containerPort + "/tcp"
	ports, exists := inspect.NetworkSettings.Ports[portKey]
	if !exists || len(ports) == 0 {
		return "", fmt.Errorf("no port mapping found for container port %s", containerPort)
	}

	// Return the first host port mapping
	hostPort := ports[0].HostPort
	if hostPort == "" {
		return "", fmt.Errorf("empty host port mapping for container port %s", containerPort)
	}

	return hostPort, nil
}

// Connect establishes a connection to the specified TON network and returns an
// explorer instance for tracing transactions.
//
// Parameters:
// - net: The TON network to connect to (e.g., "mainnet", "testnet", "mylocalton", "http://127.0.0.1:8000/localhost.global.config.json").
// - verbose: Whether to enable verbose output.
// - pageSize: The number of transactions to fetch per page.
// - maxPages: The maximum number of pages to fetch.
func Connect(lggr logger.Logger, apiClient *ton.APIClient, net string, verbose bool, pageSize uint32, maxPages uint32) (*client, error) {
	if apiClient == nil {
		var err error
		apiClient, err = connect(context.Background(), net)
		if err != nil {
			return nil, fmt.Errorf("failed to connect to network: %w", err)
		}
	}
	return &client{
		lggr:       lggr,
		connection: apiClient,
		net:        net,
		verbose:    verbose,
		pageSize:   pageSize,
		maxPages:   maxPages,
	}, nil
}

func TONConnect(lggr logger.Logger, apiClient *ton.APIClient, net string, verbose bool, pageSize uint32, maxPages uint32) (*ton.APIClient, error) {
	c, err := Connect(lggr, apiClient, net, verbose, pageSize, maxPages)
	if err != nil {
		return nil, err
	}
	return c.connection, nil
}

type client struct {
	lggr       logger.Logger
	connection *ton.APIClient
	net        string
	verbose    bool
	pageSize   uint32
	maxPages   uint32
}

type Format int

const (
	FormatTree Format = iota
	FormatSequenceURL
	FormatSequenceRaw
)

// PrintTrace connects to the specified TON network, retrieves the transaction
// by the given source address and transaction hash, and prints the full execution
// trace of the transaction, including all outgoing messages and their subsequent
// messages.
//
// Parameters:
// - ctx: The context for managing request deadlines and cancellation.
// - txHashStr: The transaction hash in hexadecimal format.
// - srcAddrStr: The source address of the transaction in string format.
func (c *client) PrintTrace(ctx context.Context, txHashStr string, srcAddrStr string, format Format, knownActors map[string]debug.TypeAndVersion) error {
	var senderAddr *address.Address
	var err error
	if srcAddrStr == "" {
		c.lggr.Debug("source address not provided, attempting to fetch from toncenter by hash...")
		senderAddr, err = c.GetSenderAddressFromTxHash(ctx, txHashStr)
		if err != nil {
			return fmt.Errorf("failed to get sender address from tx hash: %w", err)
		}
		c.lggr.Debug("source address found:", senderAddr.String())
	} else {
		senderAddr, err = address.ParseAddr(srcAddrStr)
		if err != nil {
			return fmt.Errorf("failed to parse transaction address: %w", err)
		}
	}
	txHash, err := hex.DecodeString(txHashStr)
	if err != nil {
		return fmt.Errorf("failed to decode tx hash: %w", err)
	}

	tx, err := c.findTx(ctx, c.connection, senderAddr, txHash)
	if err != nil {
		return err
	}

	c.lggr.Info("tx found in lt:", tx.LT)

	recvMsg, err := tracetracking.MapToReceivedMessage(tx)
	if err != nil {
		return fmt.Errorf("failed to map transaction to received message: %w", err)
	}

	c.lggr.Info("waiting for full trace...")

	err = recvMsg.WaitForTrace(ctx, c.connection)
	if err != nil {
		return fmt.Errorf("failed to wait for trace: %w", err)
	}

	c.lggr.Debug("actors before query:\n", knownActors)
	c.lggr.Info("querying actors")
	err = c.queryActors(ctx, &recvMsg, knownActors)
	if err != nil {
		return fmt.Errorf("failed to query actors: %w", err)
	}
	c.lggr.Debug("actors after query:\n", knownActors)

	c.lggr.Info("full trace received:")

	var debugger debug.DebuggerEnvironment
	switch format {
	case FormatSequenceURL:
		debugger = debug.NewDebuggerSequenceTrace(knownActors, sequence.OutputFmtURL)
	case FormatSequenceRaw:
		debugger = debug.NewDebuggerSequenceTrace(knownActors, sequence.OutputFmtRaw)
	case FormatTree:
		debugger = debug.NewDebuggerTreeTrace(knownActors)
	default:
		return errors.New("unknown format")
	}
	c.lggr.Info(debugger.DumpReceived(&recvMsg, c.verbose))

	return nil
}

func (c *client) queryActors(ctx context.Context, message *tracetracking.ReceivedMessage, knownActors map[string]debug.TypeAndVersion) error {
	visited := make(map[string]bool)
	block, err := c.connection.CurrentMasterchainInfo(ctx)
	if err != nil {
		return fmt.Errorf("failed to get masterchain info: %w", err)
	}
	return c.queryActorsReceivedRec(ctx, block, message, knownActors, visited)
}

func (c *client) queryActorsReceivedRec(ctx context.Context, block *ton.BlockIDExt, message *tracetracking.ReceivedMessage, knownActors map[string]debug.TypeAndVersion, visited map[string]bool) error {
	if message.InternalMsg != nil {
		err := c.queryActorIfNotVisited(ctx, block, message.InternalMsg.SrcAddr, knownActors, visited)
		if err != nil {
			return err
		}
		err = c.queryActorIfNotVisited(ctx, block, message.InternalMsg.DstAddr, knownActors, visited)
		if err != nil {
			return err
		}
		err = c.queryOutgoingMessages(ctx, block, message.OutgoingInternalSentMessages, message.OutgoingInternalReceivedMessages, knownActors, visited)
		return err
	} else if message.ExternalMsg != nil {
		err := c.queryActorIfNotVisited(ctx, block, message.ExternalMsg.DstAddr, knownActors, visited)
		if err != nil {
			return err
		}
		err = c.queryOutgoingMessages(ctx, block, message.OutgoingInternalSentMessages, message.OutgoingInternalReceivedMessages, knownActors, visited)
		return err
	}
	return fmt.Errorf("unknown message type: %+v", message)
}

func (c *client) queryOutgoingMessages(ctx context.Context, block *ton.BlockIDExt, outgoingSentMessages []*tracetracking.SentMessage, outgoingReceivedMessages []*tracetracking.ReceivedMessage, knownActors map[string]debug.TypeAndVersion, visited map[string]bool) error {
	for _, outMsg := range outgoingSentMessages {
		err := c.queryActorIfNotVisited(ctx, block, outMsg.InternalMsg.SrcAddr, knownActors, visited)
		if err != nil {
			return err
		}
		err = c.queryActorIfNotVisited(ctx, block, outMsg.InternalMsg.DstAddr, knownActors, visited)
		if err != nil {
			return err
		}
	}
	for _, outMsg := range outgoingReceivedMessages {
		err := c.queryActorsReceivedRec(ctx, block, outMsg, knownActors, visited)
		if err != nil {
			return err
		}
	}
	return nil
}

func (c *client) queryActorIfNotVisited(ctx context.Context, block *ton.BlockIDExt, addr *address.Address, knownActors map[string]debug.TypeAndVersion, visited map[string]bool) error {
	c.lggr.Debug("queryActorIfNotVisited", addr.String())
	c.lggr.Debug("visited:", visited)
	c.lggr.Debug("knownActors:", knownActors)
	if visited[addr.String()] {
		c.lggr.Debug("already visited", addr.String())
		return nil
	}
	if _, known := knownActors[addr.String()]; known {
		visited[addr.String()] = true
		c.lggr.Debug("actor found in knownActors", addr.String())
		return nil
	}
	c.lggr.Debug("actor not known")
	var typeVersion common.TypeAndVersion
	result, err := c.connection.WaitForBlock(block.SeqNo).RunGetMethod(ctx, block, addr, "typeAndVersion")
	if err != nil {
		// We don't fail here because many contracts don't implement typeAndVersion
		return nil // TODO try deducing from code?
	}

	defer func() {
	}()
	typeVersion, err = common.GetTypeAndVersion.Decoder.Decode(result)
	if err != nil {
		return fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}
	visited[addr.String()] = true
	semVer := semver.MustParse(typeVersion.Version)
	knownActors[addr.String()] = debug.TypeAndVersion{
		Version: *semVer,
		Type:    typeVersion.Type,
	}
	return nil
}

func (c *client) GetSenderAddressFromTxHash(ctx context.Context, txHashStr string) (*address.Address, error) {
	// fetch from https://testnet.toncenter.com/api/v3/transactions?hash=txHashStr
	var baseURL string
	switch c.net {
	case "mainnet":
		baseURL = "https://toncenter.com/api/v3/transactions"
	case "testnet":
		baseURL = "https://testnet.toncenter.com/api/v3/transactions"
	default:
		return nil, fmt.Errorf("unsupported network: %s", c.net)
	}
	type txResult struct {
		Account string `json:"account"`
	}
	type apiResponse struct {
		Transactions []txResult `json:"transactions"`
	}
	// Use url.URL for safer URL construction
	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid base URL: %w", err)
	}

	// Add query parameters safely
	q := u.Query()
	q.Set("hash", txHashStr) // No need for manual encoding when using url.Values
	u.RawQuery = q.Encode()

	// Create request with context and timeout
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch transaction info from toncenter: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code from toncenter: %d", resp.StatusCode)
	}
	var respData apiResponse
	err = json.NewDecoder(resp.Body).Decode(&respData)
	if err != nil {
		return nil, fmt.Errorf("failed to decode toncenter response: %w", err)
	}
	if len(respData.Transactions) != 1 {
		return nil, errors.New("transaction not found in toncenter response")
	}
	addr, err := address.ParseRawAddr(respData.Transactions[0].Account)
	if err != nil {
		return nil, fmt.Errorf("failed to parse source address from toncenter response: %w", err)
	}
	return addr, nil
}

func (c *client) findTx(ctx context.Context, api *ton.APIClient, srcAddr *address.Address, txHash []byte) (*tlb.Transaction, error) {
	block, err := api.GetMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("get masterchain info: %w", err)
	}
	account, err := api.WaitForBlock(block.SeqNo).GetAccount(ctx, block, srcAddr)
	if err != nil {
		return nil, fmt.Errorf("get account: %w", err)
	}

	// Start from the latest transaction
	maxLT := account.LastTxLT
	maxHash := account.LastTxHash
	for range c.maxPages {
		txs, err := api.ListTransactions(ctx, srcAddr, c.pageSize, maxLT, maxHash)
		if err != nil {
			return nil, fmt.Errorf("get transaction: %w", err)
		}
		for _, tx := range txs {
			if equalHash(tx.Hash, txHash) {
				return tx, nil
			}
		}
		// Move to the previous page
		last := txs[len(txs)-1]
		maxLT = last.PrevTxLT
		maxHash = last.PrevTxHash
	}
	return nil, errors.New("transaction not found in searched range. Try increasing --page-size and --max-pages")
}

func equalHash(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func connect(ctx context.Context, net string) (*ton.APIClient, error) {
	pool := liteclient.NewConnectionPool()
	switch net {
	case "mainnet":
		configURL := "https://ton-blockchain.github.io/global.config.json"
		err := pool.AddConnectionsFromConfigUrl(ctx, configURL)
		if err != nil {
			return nil, fmt.Errorf("failed to add connections from config url: %w", err)
		}
	case "testnet":
		configURL := "https://ton.org/testnet-global.config.json"
		err := pool.AddConnectionsFromConfigUrl(ctx, configURL)
		if err != nil {
			return nil, fmt.Errorf("failed to add connections from config url: %w", err)
		}
	case "mylocalton":
		// Find running mylocalton container
		containerID, err := findMylocaltonContainer(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to find mylocalton container: %w", err)
		}

		// Inspect the container to get port mappings
		inspect, err := inspectContainer(ctx, containerID)
		if err != nil {
			return nil, fmt.Errorf("failed to inspect container %s: %w", containerID, err)
		}

		// Get the external port mapping for internal port 8000 (config server)
		configPort, err := getPortMapping(inspect, "8000")
		if err != nil {
			return nil, fmt.Errorf("failed to get port mapping for config server: %w", err)
		}

		// Fetch the config from the mapped port
		configURL := fmt.Sprintf("http://127.0.0.1:%s/localhost.global.config.json", configPort)
		config, err := liteclient.GetConfigFromUrl(ctx, configURL)
		if err != nil {
			return nil, fmt.Errorf("failed to get config from url: %w", err)
		}

		// Get the liteserver port mapping
		liteserverConfig := config.Liteservers[0]
		liteserverPort := strconv.Itoa(liteserverConfig.Port)
		externalLiteserverPort, err := getPortMapping(inspect, liteserverPort)
		if err != nil {
			return nil, fmt.Errorf("failed to get port mapping for liteserver: %w", err)
		}

		// Connect to the liteserver using the external port
		connectionString := "127.0.0.1:" + externalLiteserverPort
		err = pool.AddConnection(ctx, connectionString, liteserverConfig.ID.Key)
		if err != nil {
			return nil, fmt.Errorf("failed to add localton connection: %w", err)
		}
	default:
		configURL := net
		err := pool.AddConnectionsFromConfigUrl(ctx, configURL)
		if err != nil {
			return nil, fmt.Errorf("failed to add connections from config url: %w", err)
		}
	}
	return ton.NewAPIClient(pool, ton.ProofCheckPolicyFast), nil
}

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

	"github.com/smartcontractkit/wsrpc/logger"

	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/visualizations/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

func GenerateExplorerCmd(lggr logger.Logger, contracts map[string]deployment.TypeAndVersion, client *ton.APIClient) *cobra.Command {
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

				_, err := hex.DecodeString(strings.TrimPrefix(urlOrTx, "0x"))
				if err != nil {
					return fmt.Errorf("invalid transaction hash or url: %w", err)
				}
				txHash = urlOrTx
			}

			if len(args) == 2 {
				address = args[1]
			}

			ctx := context.Background()
			client, err := Connect(lggr, client, net, verbose, pageSize, maxPages)
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
	cmd.Flags().BoolVarP(&verbose, "verbose", "v", false, "Shows full body of unmatched messages")
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

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
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
func (c *client) PrintTrace(ctx context.Context, txHashStr string, srcAddrStr string, format Format, knownActors map[string]deployment.TypeAndVersion) error {
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

	err = recvMsg.WaitForTrace(c.connection)
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

func (c *client) queryActors(ctx context.Context, message *tracetracking.ReceivedMessage, knownActors map[string]deployment.TypeAndVersion) error {
	visited := make(map[string]bool)
	block, err := c.connection.CurrentMasterchainInfo(ctx)
	if err != nil {
		return fmt.Errorf("failed to get masterchain info: %w", err)
	}
	return c.queryActorsReceivedRec(ctx, block, message, knownActors, visited)
}

func (c *client) queryActorsReceivedRec(ctx context.Context, block *ton.BlockIDExt, message *tracetracking.ReceivedMessage, knownActors map[string]deployment.TypeAndVersion, visited map[string]bool) error {
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

func (c *client) queryOutgoingMessages(ctx context.Context, block *ton.BlockIDExt, outgoingSentMessages []*tracetracking.SentMessage, outgoingReceivedMessages []*tracetracking.ReceivedMessage, knownActors map[string]deployment.TypeAndVersion, visited map[string]bool) error {
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

func (c *client) queryActorIfNotVisited(ctx context.Context, block *ton.BlockIDExt, addr *address.Address, knownActors map[string]deployment.TypeAndVersion, visited map[string]bool) error {
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
	result, err := c.connection.RunGetMethod(ctx, block, addr, "typeAndVersion")
	defer func() {
	}()
	if err != nil {
		return c.tryMatchByCodeHash(ctx, block, addr, knownActors)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}
	visited[addr.String()] = true
	semVer := semver.MustParse(typeVersion.Version)
	knownActors[addr.String()] = deployment.TypeAndVersion{
		Version: *semVer,
		Type:    deployment.ContractType(typeVersion.Type),
	}
	return nil
}

func (c *client) tryMatchByCodeHash(ctx context.Context, block *ton.BlockIDExt, addr *address.Address, knownActors map[string]deployment.TypeAndVersion) error {
	account, err := c.connection.GetAccount(ctx, block, addr)
	if err != nil {
		return fmt.Errorf("get account: %w", err)
	}
	code := account.Code.ToBOC()
	codeHex := hex.EncodeToString(code)
	switch codeHex {
	case "b5ee9c7241021001000228000114ff00f4a413f4bcf2c80b01020120020d02014803040078d020d74bc00101c060b0915be101d0d3030171b0915be0fa4030f828c705b39130e0d31f018210ae42e5a4ba9d8040d721d74cf82a01ed55fb04e030020120050a02027306070011adce76a2686b85ffc00201200809001aabb6ed44d0810122d721d70b3f0018aa3bed44d08307d721d70b1f0201200b0c001bb9a6eed44d0810162d721d70b15800e5b8bf2eda2edfb21ab09028409b0ed44d0810120d721f404f404d33fd315d1058e1bf82325a15210b99f326df82305aa0015a112b992306dde923033e2923033e25230800df40f6fa19ed021d721d70a00955f037fdb31e09130e259800df40f6fa19cd001d721d70a00937fdb31e0915be270801f6f2d48308d718d121f900ed44d0d3ffd31ff404f404d33fd315d1f82321a15220b98e12336df82324aa00a112b9926d32de58f82301de541675f910f2a106d0d31fd4d307d30cd309d33fd315d15168baf2a2515abaf2a6f8232aa15250bcf2a304f823bbf2a35304800df40f6fa199d024d721d70a00f2649130e20e01fe5309800df40f6fa18e13d05004d718d20001f264c858cf16cf8301cf168e1030c824cf40cf8384095005a1a514cf40e2f800c94039800df41704c8cbff13cb1ff40012f40012cb3f12cb15c9ed54f80f21d0d30001f265d3020171b0925f03e0fa4001d70b01c000f2a5fa4031fa0031f401fa0031fa00318060d721d300010f0020f265d2000193d431d19130e272b1fb00b585bf03": // https://github.com/ton-blockchain/highload-wallet-contract-v3/blob/main/build/HighloadWalletV3.compiled.json
		knownActors[addr.String()] = deployment.TypeAndVersion{
			Version: *semver.MustParse("3.2.0"),
			Type:    deployment.ContractType("org.ton.Wallet"),
		}
		return nil
	case "b5ee9c7241021401000281000114ff00f4a413f4bcf2c80b01020120020d020148030402dcd020d749c120915b8f6320d70b1f2082106578746ebd21821073696e74bdb0925f03e082106578746eba8eb48020d72101d074d721fa4030fa44f828fa443058bd915be0ed44d0810141d721f4058307f40e6fa1319130e18040d721707fdb3ce03120d749810280b99130e070e2100f020120050c020120060902016e07080019adce76a2684020eb90eb85ffc00019af1df6a2684010eb90eb858fc00201480a0b0017b325fb51341c75c875c2c7e00011b262fb513435c280200019be5f0f6a2684080a0eb90fa02c0102f20e011e20d70b1f82107369676ebaf2e08a7f0f01e68ef0eda2edfb218308d722028308d723208020d721d31fd31fd31fed44d0d200d31f20d31fd3ffd70a000af90140ccf9109a28945f0adb31e1f2c087df02b35007b0f2d0845125baf2e0855036baf2e086f823bbf2d0882292f800de01a47fc8ca00cb1f01cf16c9ed542092f80fde70db3cd81003f6eda2edfb02f404216e926c218e4c0221d73930709421c700b38e2d01d72820761e436c20d749c008f2e09320d74ac002f2e09320d71d06c712c2005230b0f2d089d74cd7393001a4e86c128407bbf2e093d74ac000f2e093ed55e2d20001c000915be0ebd72c08142091709601d72c081c12e25210b1e30f20d74a111213009601fa4001fa44f828fa443058baf2e091ed44d0810141d718f405049d7fc8ca0040048307f453f2e08b8e14038307f45bf2e08c22d70a00216e01b3b0f2d090e2c85003cf1612f400c9ed54007230d72c08248e2d21f2e092d200ed44d0d2005113baf2d08f54503091319c01810140d721d70a00f2e08ee2c8ca0058cf16c9ed5493f2c08de20010935bdb31e1d74cd0b4d6c35e": // https://github.com/ton-blockchain/wallet-contract-v5/blob/main/build/wallet_v5.compiled.json
		knownActors[addr.String()] = deployment.TypeAndVersion{
			Version: *semver.MustParse("3.1.0"),
			Type:    deployment.ContractType("org.ton.Wallet"),
		}
		return nil
		// TODO add missing wallets
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
	account, err := api.GetAccount(ctx, block, srcAddr)
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

package explorer

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

// Connect establishes a connection to the specified TON network and returns an
// explorer instance for tracing transactions.
//
// Parameters:
// - net: The TON network to connect to (e.g., "mainnet", "testnet", "mylocalton", "http://127.0.0.1:8000/localhost.global.config.json").
// - verbose: Whether to enable verbose output.
// - pageSize: The number of transactions to fetch per page.
// - maxPages: The maximum number of pages to fetch.
func Connect(net string, verbose bool, pageSize uint32, maxPages uint32) (*client, error) {
	apiClient, err := connect(context.Background(), net)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to network: %w", err)
	}
	return &client{
		connection: apiClient,
		net:        net,
		verbose:    verbose,
		pageSize:   pageSize,
		maxPages:   maxPages,
	}, nil
}

type client struct {
	connection *ton.APIClient
	net        string
	verbose    bool
	pageSize   uint32
	maxPages   uint32
}

// PrintTrace connects to the specified TON network, retrieves the transaction
// by the given source address and transaction hash, and prints the full execution
// trace of the transaction, including all outgoing messages and their subsequent
// messages.
//
// Parameters:
// - ctx: The context for managing request deadlines and cancellation.
// - srcAddresstr: The source address of the transaction in string format.
func (c *client) PrintTrace(ctx context.Context, txHashStr string, srcAddresstr string, visualization string) error {
	var senderAddr *address.Address
	var err error
	if srcAddresstr == "" {
		if c.verbose {
			fmt.Println("source address not provided, attempting to fetch from toncenter by hash...")
		}
		senderAddr, err = c.GetSenderAddressFromTxHash(ctx, txHashStr)
		if err != nil {
			return fmt.Errorf("failed to get sender address from tx hash: %w", err)
		}
		if c.verbose {
			fmt.Println("source address found:", senderAddr.String())
		}
	} else {
		senderAddr, err = address.ParseAddr(srcAddresstr)
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

	fmt.Println("tx found in lt:", tx.LT)

	recvMsg, err := tracetracking.MapToReceivedMessage(tx)
	if err != nil {
		return fmt.Errorf("failed to map transaction to received message: %w", err)
	}

	fmt.Println("waiting for full trace...")

	err = recvMsg.WaitForTrace(c.connection)
	if err != nil {
		return fmt.Errorf("failed to wait for trace: %w", err)
	}
	knownActors := map[string]deployment.TypeAndVersion{} // TODO fill from cld address book

	fmt.Println("querying actors")
	err = c.queryActors(ctx, &recvMsg, knownActors)
	if err != nil {
		return fmt.Errorf("failed to query actors: %w", err)
	}

	fmt.Println("full trace received:")

	var debugger debug.DebuggerEnvironment
	if visualization == "sequence" {
		debugger = debug.NewDebuggerSequenceTrace(knownActors)
	} else {
		debugger = debug.NewDebuggerTreeTrace(knownActors)
	}
	fmt.Println(debugger.DumpReceived(&recvMsg, c.verbose))

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
		fmt.Println("received internal msg from", message.InternalMsg.SrcAddr.String(), "to", message.InternalMsg.DstAddr.String())
		err := c.queryActorIfNotVisited(ctx, block, message.InternalMsg.SrcAddr, knownActors, visited)
		if err != nil {
			return err
		}
		err = c.queryActorIfNotVisited(ctx, block, message.InternalMsg.DstAddr, knownActors, visited)
		if err != nil {
			return err
		}
		err = c.queryOutgoingMessages(ctx, block, message.OutgoingInternalSentMessages, message.OutgoingInternalReceivedMessages, knownActors, visited)
		if err != nil {
			return err
		}
	} else if message.ExternalMsg != nil {
		err := c.queryActorIfNotVisited(ctx, block, message.ExternalMsg.DstAddr, knownActors, visited)
		if err != nil {
			return err
		}
		err = c.queryOutgoingMessages(ctx, block, message.OutgoingInternalSentMessages, message.OutgoingInternalReceivedMessages, knownActors, visited)
		if err != nil {
			return err
		}
	}
	fmt.Println(fmt.Errorf("unknown message type").Error())
	return nil
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
	if visited[addr.String()] {
		return nil
	}
	if _, known := knownActors[addr.String()]; known {
		visited[addr.String()] = true
		return nil
	}
	var typeVersion common.TypeAndVersion
	result, err := c.connection.RunGetMethod(ctx, block, addr, "typeAndVersion")
	defer func() {
	}()
	if err != nil {
		return nil
	}
	if err = typeVersion.FromResult(result); err != nil {
		return fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}
	visited[addr.String()] = true
	if err != nil {
		// No need to return error if contract doesn't implement typeAndVersion
		return nil
	}
	semVer := semver.MustParse(typeVersion.Version)
	knownActors[addr.String()] = deployment.TypeAndVersion{
		Version: *semVer,
		Type:    deployment.ContractType(typeVersion.Type),
	}
	return nil
}

func (c *client) GetSenderAddressFromTxHash(ctx context.Context, txHashStr string) (*address.Address, error) {
	if c.net == "mainnet" || c.net == "testnet" {
		// fetch from https://testnet.toncenter.com/api/v3/transactions?hash=txHashStr
		var apiURL string
		if c.net == "mainnet" {
			apiURL = "https://toncenter.com/api/v3/transactions?hash=" + txHashStr
		} else {
			apiURL = "https://testnet.toncenter.com/api/v3/transactions?hash=" + txHashStr
		}
		type txResult struct {
			Account string `json:"account"`
		}
		type apiResponse struct {
			Transactions []txResult `json:"transactions"`
		}
		resp, err := http.Get(apiURL)
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
			return nil, fmt.Errorf("transaction not found in toncenter response")
		}
		addr, err := address.ParseRawAddr(respData.Transactions[0].Account)
		if err != nil {
			return nil, fmt.Errorf("failed to parse source address from toncenter response: %w", err)
		}
		return addr, nil
	}
	return nil, fmt.Errorf("source address is required for non-mainnet/testnet networks")
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
	return nil, fmt.Errorf("transaction not found")
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
	configURL := net
	switch net {
	case "mainnet":
		configURL = "https://ton-blockchain.github.io/global.config.json"
	case "testnet":
		configURL = "https://ton.org/testnet-global.config.json"
	case "mylocalton":
		configURL = "http://127.0.0.1:8000/localhost.global.config.json"
	}
	pool := liteclient.NewConnectionPool()
	err := pool.AddConnectionsFromConfigUrl(ctx, configURL)
	if err != nil {
		return nil, fmt.Errorf("failed to add connections from config url: %w", err)
	}
	return ton.NewAPIClient(pool, ton.ProofCheckPolicyFast), nil
}

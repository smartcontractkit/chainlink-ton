package explorer

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"
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
func (e *client) PrintTrace(ctx context.Context, txHashStr string, srcAddresstr string) error {
	var senderAddr *address.Address
	var err error
	if srcAddresstr == "" {
		if e.verbose {
			fmt.Println("source address not provided, attempting to fetch from toncenter by hash...")
		}
		senderAddr, err = e.GetSenderAddressFromTxHash(ctx, txHashStr)
		if err != nil {
			return fmt.Errorf("failed to get sender address from tx hash: %w", err)
		}
		if e.verbose {
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

	tx, err := e.findTx(ctx, e.connection, senderAddr, txHash)
	if err != nil {
		return err
	}

	fmt.Println("tx found in lt:", tx.LT)

	recvMsg, err := tracetracking.MapToReceivedMessage(tx)
	if err != nil {
		return fmt.Errorf("failed to map transaction to received message: %w", err)
	}

	fmt.Println("waiting for full trace...")

	err = recvMsg.WaitForTrace(e.connection)
	if err != nil {
		return fmt.Errorf("failed to wait for trace: %w", err)
	}

	fmt.Println("full trace received:")

	debugger := debug.NewDebuggerTreeTrace(map[string]deployment.TypeAndVersion{})
	fmt.Println(debugger.DumpReceived(&recvMsg, e.verbose))

	return nil
}

func (e *client) GetSenderAddressFromTxHash(ctx context.Context, txHashStr string) (*address.Address, error) {
	if e.net == "mainnet" || e.net == "testnet" {
		// fetch from https://testnet.toncenter.com/api/v3/transactions?hash=txHashStr
		var apiURL string
		if e.net == "mainnet" {
			apiURL = "https://toncenter.com/api/v3/transactions?hash=" + txHashStr
		} else {
			apiURL = "https://testnet.toncenter.com/api/v3/transactions?hash=" + txHashStr
		}
		type txResult struct {
			Account string `json:"account"`
		}
		type addrEntry struct {
			UserFriendly string `json:"user_friendly"`
		}
		type apiResponse struct {
			Transactions []txResult           `json:"transactions"`
			AddressBook  map[string]addrEntry `json:"address_book"`
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

		// entry, ok := respData.AddressBook[respData.Transactions[0].Account]
		// if !ok {
		// 	return nil, fmt.Errorf("source address not found in toncenter response")
		// }
		// addr, err := address.ParseAddr(entry.UserFriendly)
		// if err != nil {
		// 	return nil, fmt.Errorf("failed to parse source address from toncenter response: %w", err)
		// }
		return addr, nil
	}
	return nil, fmt.Errorf("source address is required for non-mainnet/testnet networks")
}

func (e *client) findTx(ctx context.Context, api *ton.APIClient, srcAddr *address.Address, txHash []byte) (*tlb.Transaction, error) {
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
	for range e.maxPages {
		txs, err := api.ListTransactions(ctx, srcAddr, e.pageSize, maxLT, maxHash)
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

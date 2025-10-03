package explorer

import (
	"context"
	"encoding/hex"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

// PrintTrace connects to the specified TON network, retrieves the transaction
// by the given source address and transaction hash, and prints the full execution
// trace of the transaction, including all outgoing messages and their subsequent
// messages.
//
// Parameters:
// - ctx: The context for managing request deadlines and cancellation.
// - net: The TON network to connect to (e.g., "mainnet", "testnet", "mylocalton", "http://127.0.0.1:8000/localhost.global.config.json"").
// - srcAddresstr: The source address of the transaction in string format.
func PrintTrace(ctx context.Context, net string, srcAddresstr string, txHashStr string, verbose bool) error {
	client, err := connect(ctx, net)
	if err != nil {
		return err
	}

	return PrintTraceWithClient(ctx, client, srcAddresstr, txHashStr, verbose)
}

func PrintTraceWithClient(ctx context.Context, client *ton.APIClient, srcAddresstr string, txHashStr string, verbose bool) error {
	senderAddr, err := address.ParseAddr(srcAddresstr)
	if err != nil {
		return fmt.Errorf("failed to parse transaction address: %w", err)
	}
	txHash, err := hex.DecodeString(txHashStr)
	if err != nil {
		return fmt.Errorf("failed to decode tx hash: %w", err)
	}

	tx, err := findTx(ctx, client, senderAddr, txHash)
	if err != nil {
		return err
	}

	fmt.Println("tx found in lt:", tx.LT)

	recvMsg, err := tracetracking.MapToReceivedMessage(tx)
	if err != nil {
		return fmt.Errorf("failed to map transaction to received message: %w", err)
	}

	fmt.Println("waiting for full trace...")

	err = recvMsg.WaitForTrace(client)
	if err != nil {
		return fmt.Errorf("failed to wait for trace: %w", err)
	}

	fmt.Println("full trace received:")

	debugger := debug.NewDebuggerTreeTrace(map[string]deployment.TypeAndVersion{})
	fmt.Println(debugger.DumpReceived(&recvMsg, verbose))

	return nil
}

func findTx(ctx context.Context, api *ton.APIClient, srcAddr *address.Address, txHash []byte) (*tlb.Transaction, error) {
	block, err := api.GetMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("get masterchain info: %w", err)
	}
	account, err := api.GetAccount(ctx, block, srcAddr)
	if err != nil {
		return nil, fmt.Errorf("get account: %w", err)
	}

	const pageSize uint32 = 10

	// Start from the latest transaction
	maxLT := account.LastTxLT
	maxHash := account.LastTxHash
	for range uint64(20) {
		txs, err := api.ListTransactions(ctx, srcAddr, pageSize, maxLT, maxHash)
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

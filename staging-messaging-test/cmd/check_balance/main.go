package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib"
	_ "github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib/evm"
	_ "github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib/ton"
)

// BalanceOutput is the JSON output format
type BalanceOutput struct {
	Chain   string `json:"chain"`
	Address string `json:"address"`
	Balance string `json:"balance"`
	Error   string `json:"error,omitempty"`
}

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintf(os.Stderr, "Usage: %s <chain_selector> <address>\n", os.Args[0])
		os.Exit(1)
	}

	chainSel, err := strconv.ParseUint(os.Args[1], 10, 64)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Invalid chain selector: %v\n", err)
		os.Exit(1)
	}

	address := os.Args[2]

	result := BalanceOutput{
		Chain:   os.Args[1],
		Address: address,
	}

	// Create logger
	lggr, err := logger.New()
	if err != nil {
		result.Error = fmt.Sprintf("failed to create logger: %v", err)
		outputJSON(result)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Get chain family and endpoint
	family, err := chainsel.GetSelectorFamily(chainSel)
	if err != nil {
		result.Error = fmt.Sprintf("unknown chain family: %v", err)
		outputJSON(result)
		os.Exit(1)
	}

	// Get endpoint from environment based on chain
	chainName, _ := lib.GetChainName(chainSel)
	envPrefix := strings.ToUpper(strings.ReplaceAll(strings.ReplaceAll(chainName, " ", "_"), "-", "_"))
	endpoint := os.Getenv(envPrefix + "_ENDPOINT")
	if endpoint == "" {
		result.Error = fmt.Sprintf("%s_ENDPOINT not set", envPrefix)
		outputJSON(result)
		os.Exit(1)
	}

	// Get client factory
	factory, ok := lib.GetClientFactory(family)
	if !ok {
		result.Error = fmt.Sprintf("no factory for chain family: %s", family)
		outputJSON(result)
		os.Exit(1)
	}

	// Create client (no wallet key needed for balance check)
	client, err := factory(ctx, lggr, chainSel, endpoint, "")
	if err != nil {
		result.Error = fmt.Sprintf("failed to create client: %v", err)
		outputJSON(result)
		os.Exit(1)
	}

	// Get balance
	balance, err := client.GetBalance(ctx, address)
	if err != nil {
		result.Error = fmt.Sprintf("failed to get balance: %v", err)
		outputJSON(result)
		os.Exit(1)
	}

	result.Balance = balance
	outputJSON(result)
}

func outputJSON(result BalanceOutput) {
	data, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(data))
}

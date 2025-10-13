package main

import (
	"fmt"
	"os"

	"github.com/smartcontractkit/wsrpc/logger"

	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/explorer"
)

var rootCmd = explorer.GenerateExplorerCmd(logger.DefaultLogger, map[string]deployment.TypeAndVersion{}, nil)

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

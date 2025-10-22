package main

import (
	"fmt"
	"os"

	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/explorer"
)

var rootCmd = explorer.GenerateExplorerCmd(nil, map[string]deployment.TypeAndVersion{}, nil)

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

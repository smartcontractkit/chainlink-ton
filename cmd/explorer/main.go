package main

import (
	"fmt"
	"os"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/explorer"
)

var rootCmd = explorer.GenerateExplorerCmd()

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

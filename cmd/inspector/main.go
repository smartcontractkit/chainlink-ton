package main

import (
	"fmt"
	"os"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/inspector"
)

var rootCmd = inspector.GenerateInspectorCmd(nil, nil)

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

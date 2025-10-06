package main

import (
	"context"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/explorer"
)

var (
	destAddressStr string
	txHashStr      string
	net            string
	verbose        bool
	pageSize       uint32
	maxPages       uint32
)

var rootCmd = &cobra.Command{
	Use:   "explorer <address> <tx-hash>",
	Short: "TON blockchain explorer and trace analyzer",
	Long: `A command-line tool for exploring TON blockchain transactions and analyzing traces.
This tool helps debug and understand transaction flows on the TON network.

Arguments:
  address   Destination address in base64
  tx-hash   Transaction hash in hex`,
	Args: func(cmd *cobra.Command, args []string) error {
		if len(args) < 2 {
			return fmt.Errorf("requires exactly 2 arguments: <address> <tx-hash>")
		}
		return nil
	},
	RunE: func(cmd *cobra.Command, args []string) error {
		// Use positional arguments if provided, otherwise fall back to flags
		address := args[0]
		txHash := args[1]

		// Override with flags if they were explicitly provided
		if destAddressStr != "" {
			address = destAddressStr
		}
		if txHashStr != "" {
			txHash = txHashStr
		}

		ctx := context.Background()
		client, err := explorer.Connect(net, verbose, pageSize, maxPages)
		if err != nil {
			return fmt.Errorf("failed to initialize explorer: %w", err)
		}
		err = client.PrintTrace(ctx, address, txHash)
		if err != nil {
			return fmt.Errorf("failed to execute trace: %w", err)
		}
		return nil
	},
}

func init() {
	rootCmd.Flags().StringVarP(&destAddressStr, "address", "a", "", "Destination address in base64 (optional if provided as argument)")
	rootCmd.Flags().StringVarP(&txHashStr, "tx", "t", "", "Transaction hash in hex (optional if provided as argument)")
	rootCmd.Flags().StringVarP(&net, "net", "n", "testnet", "TON network (mainnet, testnet, mylocalton, or http://domain/x.global.config.json)")
	rootCmd.Flags().BoolVarP(&verbose, "verbose", "v", false, "Shows full body of unmatched messages")
	rootCmd.Flags().Uint32VarP(&pageSize, "page-size", "s", 10, "Number of blocks to fetch per page")
	rootCmd.Flags().Uint32VarP(&maxPages, "max-pages", "p", 10, "Maximum number of pages to fetch")
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

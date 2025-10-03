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
)

var rootCmd = &cobra.Command{
	Use:   "explorer",
	Short: "TON blockchain explorer and trace analyzer",
	Long: `A command-line tool for exploring TON blockchain transactions and analyzing traces.
This tool helps debug and understand transaction flows on the TON network.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if destAddressStr == "" || txHashStr == "" {
			return fmt.Errorf("both --address and --tx flags are required")
		}

		ctx := context.Background()
		err := explorer.PrintTrace(ctx, net, destAddressStr, txHashStr, verbose)
		if err != nil {
			return fmt.Errorf("failed to execute trace: %w", err)
		}
		return nil
	},
}

func init() {
	rootCmd.Flags().StringVarP(&destAddressStr, "address", "a", "", "Destination address in base64 (required)")
	rootCmd.Flags().StringVarP(&txHashStr, "tx", "t", "", "Transaction hash in hex (required)")
	rootCmd.Flags().StringVarP(&net, "net", "n", "testnet", "TON network (mainnet, testnet, mylocalton, or http://domain/x.global.config.json)")
	rootCmd.Flags().BoolVarP(&verbose, "verbose", "v", false, "Shows full body of unmatched messages")

	if err := rootCmd.MarkFlagRequired("address"); err != nil {
		panic(err)
	}
	if err := rootCmd.MarkFlagRequired("tx"); err != nil {
		panic(err)
	}
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

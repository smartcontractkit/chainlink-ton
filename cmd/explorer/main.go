package main

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"

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
	visualization  string
	format         string
)

var rootCmd = &cobra.Command{
	Use:   "explorer <tx-hash> <address> | <url>",
	Short: "TON blockchain explorer and trace analyzer",
	Long: `A command-line tool for exploring TON blockchain transactions and analyzing traces.
This tool helps debug and understand transaction flows on the TON network.

Usage:
  explorer <tx-hash> <address>  - Analyze transaction with address and hash
  explorer <url>                - Analyze transaction from URL

Arguments:
  address   Destination address in base64
  tx-hash   Transaction hash in hex
  url       tonscan TX URL`,
	Args: func(cmd *cobra.Command, args []string) error {
		if len(args) != 1 && len(args) != 2 {
			return errors.New("requires 1 argument (URL) or 2 arguments (<tx-hash> <address>)")
		}
		return nil
	},
	RunE: func(cmd *cobra.Command, args []string) error {
		var txHash, address, parsedNet string

		urlOrTx := args[0]
		var parseURLErr error
		txHash, address, parsedNet, parseURLErr = explorer.ParseURL(urlOrTx)
		if parseURLErr == nil {
			if cmd.Root().Flags().Changed("net") {
				return errors.New("cannot specify network flag when using URL")
			}
			net = parsedNet
		} else {
			// Not a URL, treat as tx-hash
			if len(urlOrTx) != 64 && (len(urlOrTx) != 66 || !strings.HasPrefix(urlOrTx, "0x")) {
				return fmt.Errorf("failed to parse URL: %w", parseURLErr)
			}

			_, err := hex.DecodeString(strings.TrimPrefix(urlOrTx, "0x"))
			if err != nil {
				return fmt.Errorf("invalid transaction hash or url: %w", err)
			}
			txHash = urlOrTx
		}

		if len(args) == 2 {
			address = args[1]
		}

		ctx := context.Background()
		client, parseURLErr := explorer.Connect(net, verbose, pageSize, maxPages)
		if parseURLErr != nil {
			return fmt.Errorf("failed to initialize explorer: %w", parseURLErr)
		}
		explorerFormat, err := parseFormat(visualization, format)
		if err != nil {
			return fmt.Errorf("failed to parse format: %w", err)
		}
		parseURLErr = client.PrintTrace(ctx, txHash, address, explorerFormat)
		if parseURLErr != nil {
			return fmt.Errorf("failed to execute trace: %w", parseURLErr)
		}
		return nil
	},
}

func parseFormat(visualization string, format string) (explorer.Format, error) {
	switch visualization {
	case "tree":
		if format != "" {
			return explorer.Format(0), fmt.Errorf("format option is not applicable for tree visualization")
		}
		return explorer.FormatTree, nil
	case "sequence":
		switch format {
		case "", "url":
			return explorer.FormatSequenceURL, nil
		case "raw":
			return explorer.FormatSequenceRaw, nil
		}
		return explorer.Format(0), fmt.Errorf("invalid sequence format: %s", format)
	}
	return explorer.Format(0), fmt.Errorf("invalid visualization format: %s", format)
}

func init() {
	rootCmd.Flags().StringVarP(&destAddressStr, "address", "a", "", "Destination address in base64 (optional if provided as argument)")
	rootCmd.Flags().StringVarP(&visualization, "visualization", "V", "sequence", "Visualization format (sequence or tree)")
	rootCmd.Flags().StringVarP(&format, "format", "f", "", "Sequence visualization format (url or raw) (only for sequence visualization)")
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

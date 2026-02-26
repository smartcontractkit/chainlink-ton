package explorer

import (
	"context"
	"errors"
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/spf13/cobra"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"go.uber.org/zap/zapcore"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug/visualizations/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

func GenerateExplorerCmd(lggr *logger.Logger, contracts map[string]debug.TypeAndVersion, client *ton.APIClient) *cobra.Command {
	var (
		net           string
		verbose       bool
		pageSize      uint32
		maxPages      uint32
		visualization string
		format        string
	)

	cmd := &cobra.Command{
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
			var err error
			var log logger.Logger
			if lggr != nil {
				log = *lggr
			} else {
				config := logger.Config{}
				if verbose {
					config.Level = zapcore.DebugLevel
				}
				log, err = config.New()
				if err != nil {
					return fmt.Errorf("failed to create logger: %w", err)
				}
			}
			if client != nil && cmd.Flags().Changed("net") {
				return errors.New("cannot specify network flag when using existing client")
			}

			input, err := parseCLIInput(cmd, args)
			if err != nil {
				return err
			}
			net = input.net

			ctx := context.Background()
			client, err := Connect(log, client, net, verbose, pageSize, maxPages)
			if err != nil {
				return fmt.Errorf("failed to initialize explorer: %w", err)
			}
			explorerFormat, err := parseFormat(visualization, format)
			if err != nil {
				return fmt.Errorf("failed to parse format: %w", err)
			}
			err = client.PrintTrace(ctx, input.txHash, input.address, explorerFormat, contracts)
			if err != nil {
				return fmt.Errorf("failed to execute trace: %w", err)
			}
			return nil
		},
	}

	cmd.Flags().StringVarP(&visualization, "visualization", "V", "sequence", "Visualization format (sequence or tree)")
	cmd.Flags().StringVarP(&format, "format", "f", "", "Sequence visualization format (url or raw) (only for sequence visualization)")
	cmd.Flags().StringVarP(&net, "net", "n", "testnet", "TON network (mainnet, testnet, mylocalton, or http://domain/x.global.config.json)")
	if lggr == nil {
		cmd.Flags().BoolVarP(&verbose, "verbose", "v", false, "Shows full body of unmatched messages")
	}
	cmd.Flags().Uint32VarP(&pageSize, "page-size", "s", 10, "Number of blocks to fetch per page")
	cmd.Flags().Uint32VarP(&maxPages, "max-pages", "p", 10, "Maximum number of pages to fetch")

	return cmd
}

// Connect establishes a connection to the specified TON network and returns an
// explorer instance for tracing transactions.
func Connect(lggr logger.Logger, apiClient *ton.APIClient, net string, verbose bool, pageSize uint32, maxPages uint32) (*client, error) {
	if apiClient == nil {
		var err error
		apiClient, err = connect(context.Background(), net)
		if err != nil {
			return nil, fmt.Errorf("failed to connect to network: %w", err)
		}
	}
	return &client{
		lggr:       lggr,
		connection: apiClient,
		net:        net,
		verbose:    verbose,
		pageSize:   pageSize,
		maxPages:   maxPages,
	}, nil
}

func TONConnect(lggr logger.Logger, apiClient *ton.APIClient, net string, verbose bool, pageSize uint32, maxPages uint32) (*ton.APIClient, error) {
	c, err := Connect(lggr, apiClient, net, verbose, pageSize, maxPages)
	if err != nil {
		return nil, err
	}
	return c.connection, nil
}

type client struct {
	lggr       logger.Logger
	connection *ton.APIClient
	net        string
	verbose    bool
	pageSize   uint32
	maxPages   uint32
}

func (c *client) resilientAPI() ton.APIClientWrapped { return c.connection.WithRetry(5) }

func (c *client) PrintTrace(ctx context.Context, txHashStr string, srcAddrStr string, format Format, knownActors map[string]debug.TypeAndVersion) error {
	api := c.resilientAPI()
	effectiveTxHash := txHashStr
	if c.supportsToncenter() {
		rootTxHash, rootErr := c.getTraceRootTxHash(ctx, txHashStr)
		if rootErr == nil && rootTxHash != "" {
			effectiveTxHash = rootTxHash
			if rootTxHash != txHashStr {
				c.lggr.Info("resolved input transaction to trace root", "input_tx_hash", txHashStr, "root_tx_hash", rootTxHash)
			}
		} else if rootErr != nil {
			c.lggr.Debug("failed to resolve trace root tx hash, continuing with provided tx", "tx_hash", txHashStr, "error", rootErr)
		}
	}

	senderAddr, err := resolveSenderAddress(ctx, c, srcAddrStr, effectiveTxHash, txHashStr)
	if err != nil {
		return fmt.Errorf("failed to resolve sender address: %w", err)
	}
	decodedTxHash, err := decodeTxHash(effectiveTxHash)
	if err != nil {
		return fmt.Errorf("failed to decode tx hash: %w", err)
	}

	tx, err := c.findTx(ctx, api, senderAddr, effectiveTxHash, decodedTxHash)
	if err != nil {
		return err
	}

	c.lggr.Info("tx found in lt:", tx.LT)

	recvMsg, err := tracetracking.MapToReceivedMessage(tx)
	if err != nil {
		return fmt.Errorf("failed to map transaction to received message: %w", err)
	}

	c.lggr.Info("waiting for full trace...")
	if err = recvMsg.WaitForTrace(ctx, api); err != nil {
		return fmt.Errorf("failed to wait for trace: %w", err)
	}

	c.lggr.Debug("actors before query:\n", knownActors)
	c.lggr.Info("querying actors")
	if err = c.queryActors(ctx, api, &recvMsg, knownActors); err != nil {
		return fmt.Errorf("failed to query actors: %w", err)
	}
	c.lggr.Debug("actors after query:\n", knownActors)

	var debugger debug.DebuggerEnvironment
	switch format {
	case FormatSequenceURL:
		debugger = debug.NewDebuggerSequenceTrace(knownActors, sequence.OutputFmtURL)
	case FormatSequenceRaw:
		debugger = debug.NewDebuggerSequenceTrace(knownActors, sequence.OutputFmtRaw)
	case FormatTree:
		debugger = debug.NewDebuggerTreeTrace(knownActors)
	default:
		return errors.New("unknown format")
	}

	output := debugger.DumpReceived(&recvMsg, c.verbose)
	if format == FormatSequenceURL {
		if err = openInBrowser(ctx, output); err != nil {
			return fmt.Errorf("failed to open mermaid url in browser: %w", err)
		}
		c.lggr.Info("opened mermaid visualization in browser")
		return nil
	}

	c.lggr.Info(output)
	return nil
}

func resolveSenderAddress(ctx context.Context, c *client, srcAddrStr string, effectiveTxHash string, txHashStr string) (*address.Address, error) {
	if srcAddrStr == "" {
		if !c.supportsToncenter() {
			return nil, fmt.Errorf("source address is required for network %s when toncenter metadata is unavailable", c.net)
		}
		c.lggr.Debug("source address not provided, attempting to fetch from toncenter by hash...")
		senderAddr, err := c.GetSenderAddressFromTxHash(ctx, effectiveTxHash)
		if err != nil {
			return nil, fmt.Errorf("failed to get sender address from tx hash: %w", err)
		}
		c.lggr.Debug("source address found:", senderAddr.String())
		return senderAddr, nil
	}
	if effectiveTxHash != txHashStr && c.supportsToncenter() {
		senderAddr, err := c.GetSenderAddressFromTxHash(ctx, effectiveTxHash)
		if err != nil {
			return nil, fmt.Errorf("failed to get root sender address from tx hash: %w", err)
		}
		c.lggr.Debug("overriding provided source address with trace root account", senderAddr.String())
		return senderAddr, nil
	}

	senderAddr, err := address.ParseAddr(srcAddrStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse transaction address: %w", err)
	}

	return senderAddr, nil
}

func (c *client) queryActors(ctx context.Context, api ton.APIClientWrapped, message *tracetracking.ReceivedMessage, knownActors map[string]debug.TypeAndVersion) error {
	visited := make(map[string]bool)
	block, err := api.CurrentMasterchainInfo(ctx)
	if err != nil {
		return fmt.Errorf("failed to get masterchain info: %w", err)
	}
	return c.queryActorsReceivedRec(ctx, api, block, message, knownActors, visited)
}

func (c *client) queryActorsReceivedRec(ctx context.Context, api ton.APIClientWrapped, block *ton.BlockIDExt, message *tracetracking.ReceivedMessage, knownActors map[string]debug.TypeAndVersion, visited map[string]bool) error {
	if message.InternalMsg != nil {
		err := c.queryActorIfNotVisited(ctx, api, block, message.InternalMsg.SrcAddr, knownActors, visited)
		if err != nil {
			return err
		}
		err = c.queryActorIfNotVisited(ctx, api, block, message.InternalMsg.DstAddr, knownActors, visited)
		if err != nil {
			return err
		}
		return c.queryOutgoingMessages(ctx, api, block, message.OutgoingInternalSentMessages, message.OutgoingInternalReceivedMessages, knownActors, visited)
	}
	if message.ExternalMsg != nil {
		err := c.queryActorIfNotVisited(ctx, api, block, message.ExternalMsg.DstAddr, knownActors, visited)
		if err != nil {
			return err
		}
		return c.queryOutgoingMessages(ctx, api, block, message.OutgoingInternalSentMessages, message.OutgoingInternalReceivedMessages, knownActors, visited)
	}
	return fmt.Errorf("unknown message type: %+v", message)
}

func (c *client) queryOutgoingMessages(ctx context.Context, api ton.APIClientWrapped, block *ton.BlockIDExt, outgoingSentMessages []*tracetracking.SentMessage, outgoingReceivedMessages []*tracetracking.ReceivedMessage, knownActors map[string]debug.TypeAndVersion, visited map[string]bool) error {
	for _, outMsg := range outgoingSentMessages {
		err := c.queryActorIfNotVisited(ctx, api, block, outMsg.InternalMsg.SrcAddr, knownActors, visited)
		if err != nil {
			return err
		}
		err = c.queryActorIfNotVisited(ctx, api, block, outMsg.InternalMsg.DstAddr, knownActors, visited)
		if err != nil {
			return err
		}
	}
	for _, outMsg := range outgoingReceivedMessages {
		if err := c.queryActorsReceivedRec(ctx, api, block, outMsg, knownActors, visited); err != nil {
			return err
		}
	}
	return nil
}

func (c *client) queryActorIfNotVisited(ctx context.Context, api ton.APIClientWrapped, block *ton.BlockIDExt, addr *address.Address, knownActors map[string]debug.TypeAndVersion, visited map[string]bool) error {
	c.lggr.Debug("queryActorIfNotVisited", addr.String())
	if visited[addr.String()] {
		return nil
	}
	if _, known := knownActors[addr.String()]; known {
		visited[addr.String()] = true
		return nil
	}

	result, err := api.RunGetMethod(ctx, block, addr, "typeAndVersion")
	if err != nil {
		return nil
	}

	typeVersion, err := common.GetTypeAndVersion.Decoder.Decode(result)
	if err != nil {
		return fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}
	visited[addr.String()] = true
	semVer := semver.MustParse(typeVersion.Version)
	knownActors[addr.String()] = debug.TypeAndVersion{
		Version: *semVer,
		Type:    typeVersion.Type,
	}
	return nil
}

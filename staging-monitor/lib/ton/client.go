package ton

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	tonlploader "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/loader/account"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/backend/txparser"
	tonlptypes "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
	tonchain "github.com/smartcontractkit/chainlink-ton/pkg/ton/chain"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	"github.com/smartcontractkit/chainlink-ton/staging-monitor/lib"
)

func init() {
	lib.RegisterClientFactory(chainsel.FamilyTon, NewClient)
}

// Client implements lib.Client for TON chains
type Client struct {
	chainSel uint64
	lggr     logger.Logger
	client   *ton.APIClient
	wallet   *wallet.Wallet
}

// NewClient creates a new TON client
func NewClient(ctx context.Context, lggr logger.Logger, chainSel uint64, endpoint string, walletKey string) (lib.Client, error) {
	// support both liteserver:// and config URL format
	client, err := connectClient(ctx, endpoint)
	if err != nil {
		return nil, fmt.Errorf("failed to get TON client: %w", err)
	}

	c := &Client{
		chainSel: chainSel,
		lggr:     lggr,
		client:   client,
	}

	if walletKey != "" {
		// V5R1 Final - latest wallet version
		v5r1Config := wallet.ConfigV5R1Final{
			NetworkGlobalID: lib.TONNetworkGlobalIDTestnet,
			Workchain:       0,
		}
		w, err := wallet.FromSeed(client, strings.Fields(walletKey), v5r1Config)
		if err != nil {
			return nil, fmt.Errorf("failed to create TON wallet: %w", err)
		}

		c.wallet = w

		mc, _ := client.CurrentMasterchainInfo(ctx)
		balance, _ := w.GetBalance(ctx, mc)
		lggr.Infow("TON wallet initialized",
			"balance", balance.String())
	}

	return c, nil
}

func connectClient(ctx context.Context, endpoint string) (*ton.APIClient, error) {
	if strings.HasPrefix(endpoint, "liteserver://") {
		pool, err := tonchain.CreateLiteserverConnectionPool(ctx, endpoint)
		if err != nil {
			return nil, fmt.Errorf("failed to create liteserver connection pool: %w", err)
		}
		return ton.NewAPIClient(pool, ton.ProofCheckPolicyFast), nil
	}
	// connect via config URL
	cfg, err := liteclient.GetConfigFromUrl(ctx, endpoint)
	if err != nil {
		return nil, fmt.Errorf("failed to get TON config: %w", err)
	}
	pool := liteclient.NewConnectionPool()
	err = pool.AddConnectionsFromConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to TON: %w", err)
	}
	return ton.NewAPIClient(pool, ton.ProofCheckPolicyFast), nil
}

func (c *Client) ChainSelector() uint64 {
	return c.chainSel
}

// TODO: externalize message configurations to cover more scenarios(tokens, gas, etc)
func (c *Client) SendMessage(ctx context.Context, lggr logger.Logger, msg lib.MessageToSend) (*lib.SendResult, error) {
	routerAddr, err := address.ParseAddr(msg.Router)
	if err != nil {
		return nil, fmt.Errorf("failed to parse router address: %w", err)
	}

	// Build extra args
	extraArgs := onramp.GenericExtraArgsV2{
		GasLimit:                 big.NewInt(lib.TONDefaultGasLimit),
		AllowOutOfOrderExecution: true,
	}

	extraArgsCell, err := tlb.ToCell(extraArgs)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize ExtraArgs: %w", err)
	}

	// Parse receiver bytes
	receiverBytes := []byte(msg.Receiver)
	// If receiver is hex string, decode it
	if strings.HasPrefix(msg.Receiver, "0x") {
		receiverBytes, err = hex.DecodeString(msg.Receiver[2:])
		if err != nil {
			return nil, fmt.Errorf("failed to decode receiver hex: %w", err)
		}
		// Left-pad EVM addresses to 32 bytes (required by TON router)
		receiverBytes = leftPadTo32(receiverBytes)
	}

	// Build CCIPSend message
	ccipSend := router.CCIPSend{
		QueryID:           uint64(0),
		DestChainSelector: msg.DestChainSel,
		Receiver:          receiverBytes,
		Data:              msg.Data,
		TokenAmounts:      nil,
		FeeToken:          address.MustParseRawAddr("0:0000000000000000000000000000000000000000000000000000000000000001"),
		ExtraArgs:         extraArgsCell,
	}

	messageBody, err := tlb.ToCell(ccipSend)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize CCIPSend: %w", err)
	}

	// Create wallet message
	walletMsg := &wallet.Message{
		Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      false,
			DstAddr:     routerAddr,
			Amount:      tlb.MustFromTON(lib.TONMessageValue),
			Body:        messageBody,
		},
	}

	// Send transaction with trace tracking
	tt := tracetracking.NewSignedAPIClient(c.client, *c.wallet)
	receivedMsg, _, err := tt.SendWaitTransaction(ctx, *routerAddr, walletMsg)
	if err != nil {
		return nil, fmt.Errorf("send transaction failed: %w", err)
	}

	if receivedMsg.ExitCode != 0 {
		return nil, fmt.Errorf("router execution failed with exit code %d", receivedMsg.ExitCode)
	}

	// Wait for trace
	err = receivedMsg.WaitForTrace(c.client)
	if err != nil {
		return nil, fmt.Errorf("trace wait failed: %w", err)
	}

	// Extract sequence number and messageID from CCIPMessageSent event
	seqNum, messageID, err := extractFromCCIPMessageSent(receivedMsg)
	if err != nil {
		return nil, fmt.Errorf("failed to extract from CCIPMessageSent event: %w", err)
	}

	lggr.Infow("CCIP message sent from TON", "seqNum", seqNum, "messageID", messageID)

	return &lib.SendResult{
		SeqNum:    seqNum,
		MessageID: messageID,
		TxHash:    "", // TON doesn't have simple tx hash concept
		BlockNum:  0,  // Not easily available
	}, nil
}

func (c *Client) GetCurrentBlock(ctx context.Context) (uint64, error) {
	mc, err := c.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, err
	}
	return uint64(mc.SeqNo), nil
}

func (c *Client) WaitForMessageReceived(ctx context.Context, lggr logger.Logger, receiver string, messageID string, expectedData string, startBlock uint64) error {
	receiverAddr, err := address.ParseAddr(receiver)
	if err != nil {
		return fmt.Errorf("failed to parse receiver address: %w", err)
	}

	lggr.Infow("Waiting for CCIPReceive event", "receiver", receiver, "messageID", messageID, "startBlock", startBlock)

	cl := c.client.WithRetry(lib.TONClientRetries)
	// Initialize transaction loader (same pattern as ton_assertions.go)
	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return cl, nil
	}
	loader := tonlploader.NewTxLoader(lggr, clientProvider, lib.TONTxBatchSize)

	ticker := time.NewTicker(lib.TONPollInterval)
	defer ticker.Stop()

	lastProgressLog := time.Now()
	lastProcessedBlock := uint32(startBlock) //nolint:gosec // safe conversion

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()

		case <-ticker.C:
			// Progress log every 15 seconds
			if time.Since(lastProgressLog) > lib.ProgressLogInterval {
				lggr.Infow("Still waiting for CCIPReceive", "receiver", receiver, "lastBlock", lastProcessedBlock)
				lastProgressLog = time.Now()
			}

			// Get current block
			toBlock, err := cl.CurrentMasterchainInfo(ctx)
			if err != nil {
				lggr.Warnw("Failed to get current masterchain info", "error", err)
				continue
			}

			// No new blocks to process
			if toBlock.SeqNo <= lastProcessedBlock {
				continue
			}

			// Lookup previous block
			var prevBlock *ton.BlockIDExt
			if lastProcessedBlock > 0 {
				prevBlock, err = cl.LookupBlock(ctx, toBlock.Workchain, toBlock.Shard, lastProcessedBlock)
				if err != nil {
					lggr.Warnw("Failed to lookup previous block", "block", lastProcessedBlock, "error", err)
					continue
				}
			}

			blockRange := &tonlptypes.BlockRange{Prev: prevBlock, To: toBlock}

			// Fetch transactions for receiver address
			txs, err := loader.FetchTxsForAddress(ctx, blockRange, receiverAddr)
			if err != nil {
				lggr.Warnw("Failed to load transactions", "error", err)
				continue
			}

			// Process transactions
			for _, txWithBlock := range txs {
				if txWithBlock.Tx == nil || txWithBlock.Tx.IO.In == nil {
					continue
				}

				tx := txWithBlock.Tx

				// Check if this is a CCIPReceive message
				if tx.IO.In.MsgType == tlb.MsgTypeInternal {
					intMsg := tx.IO.In.AsInternal()

					// Use txparser utility to extract opcode and validate
					sig, _, err := txparser.ParseInternalMsg(intMsg, offramp.CCIPReceiveOpCode)
					if err != nil || sig == 0 {
						continue // Not a CCIPReceive message or parse error
					}

					// Decode full CCIPReceive message (including magic tag)
					var ccipMsg offramp.CCIPReceive
					if err := tlb.LoadFromCell(&ccipMsg, intMsg.Body.BeginParse()); err != nil {
						lggr.Errorw("Failed to decode CCIPReceive",
							"error", err,
							"txHash", hex.EncodeToString(tx.Hash),
							"block", txWithBlock.Block.SeqNo)
						return fmt.Errorf("failed to decode CCIPReceive (struct mismatch?): %w", err)
					}

					receivedMessageID := hex.EncodeToString(ccipMsg.Message.MessageID[:])

					// Match on messageID if provided
					if messageID != "" && receivedMessageID != messageID {
						continue
					}

					// Decode and match data if expectedData provided
					if expectedData != "" && ccipMsg.Message.Data != nil {
						dataSlice := ccipMsg.Message.Data.BeginParse()
						if dataSlice.BitsLeft() > 0 {
							dataBits, err := dataSlice.LoadSlice(dataSlice.BitsLeft())
							if err == nil {
								gotData := string(dataBits)
								if gotData != expectedData {
									continue
								}
							}
						}
					}

					lggr.Infow("CCIPReceive found", "messageID", receivedMessageID, "block", txWithBlock.Block.SeqNo)
					return nil
				}
			}

			// Update last processed block
			lastProcessedBlock = toBlock.SeqNo
		}
	}
}

func (c *Client) GetBalance(ctx context.Context, addrStr string) (string, error) {
	addr, err := address.ParseAddr(addrStr)
	if err != nil {
		return "", fmt.Errorf("failed to parse address: %w", err)
	}

	mc, err := c.client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get masterchain info: %w", err)
	}

	acc, err := c.client.GetAccount(ctx, mc, addr)
	if err != nil {
		return "", fmt.Errorf("failed to get account: %w", err)
	}

	if !acc.IsActive {
		return "0", nil
	}

	// Convert nanoTON to TON (divide by 10^9)
	// acc.State.Balance is tlb.Coins which contains a *big.Int
	tonAmount := acc.State.Balance.Nano()
	ton := new(big.Float).Quo(new(big.Float).SetInt(tonAmount), new(big.Float).SetInt64(1e9))
	return ton.Text('f', 9), nil
}

func (c *Client) GetWalletAddress() (string, error) {
	if c.wallet == nil {
		return "", fmt.Errorf("wallet not initialized")
	}
	return c.wallet.Address().String(), nil
}

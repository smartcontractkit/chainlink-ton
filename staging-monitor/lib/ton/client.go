package ton

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	ccip_receiver "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/receiver"
	tonlploader "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader"
	tonlpmodels "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	tonchain "github.com/smartcontractkit/chainlink-ton/pkg/ton/chain"
	tonevent "github.com/smartcontractkit/chainlink-ton/pkg/ton/event"

	cldfchain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"

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

	fqAddr, err := address.ParseAddr(msg.FeeQuoter)
	if err != nil {
		return nil, fmt.Errorf("failed to parse FeeQuoter address: %w", err)
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

	// Build TonSendRequest
	tonRequest := ops.TonSendRequest{
		QueryID:   0,
		Receiver:  receiverBytes,
		Data:      msg.Data,
		ExtraArgs: extraArgsCell,
		FeeToken:  tvm.TonTokenAddr,
	}

	// Build minimal Environment
	tonProvider := &cldfton.Chain{
		ChainMetadata: cldfton.ChainMetadata{
			Selector: c.chainSel,
		},
		Client:        c.client,
		Wallet:        c.wallet,
		WalletAddress: c.wallet.WalletAddress(),
	}

	blockchains := cldfchain.NewBlockChainsFromSlice([]cldfchain.BlockChain{tonProvider})

	env := cldf.Environment{
		GetContext:  func() context.Context { return ctx },
		Logger:      lggr,
		BlockChains: blockchains,
	}

	// Build CCIPChainState
	chainState := state.CCIPChainState{
		Router:    *routerAddr,
		FeeQuoter: *fqAddr,
	}

	// Call SendTonRequest from deployment/ccip
	seqNum, event, err := ops.SendTonRequest(env, chainState, c.chainSel, msg.DestChainSel, tonRequest)
	if err != nil {
		return nil, err
	}

	// Extract messageID from event
	ccipEvent, ok := event.(onramp.CCIPMessageSent)
	if !ok {
		return nil, fmt.Errorf("unexpected event type: %T", event)
	}

	messageID := hex.EncodeToString(ccipEvent.Message.Header.MessageID)
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

	lggr.Infow("Waiting for CCIPReceive event", "receiver", lib.RedactAddress(receiver), "messageID", messageID, "startBlock", startBlock)

	cl := c.client.WithRetry(lib.TONClientRetries)
	// Initialize transaction loader (same pattern as ton_assertions.go)
	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return cl, nil
	}
	loader := tonlploader.New(lggr, clientProvider)

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
				lggr.Infow("Still waiting for CCIPReceive", "receiver", lib.RedactAddress(receiver), "lastBlock", lastProcessedBlock)
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

			blockRange := &tonlpmodels.BlockRange{Prev: prevBlock, To: toBlock}

			// Fetch transactions for receiver address
			txsCh := make(chan tonlpmodels.Tx, lib.TONTxBatchSize)
			errsCh := make(chan error, 1)

			go func() {
				defer close(txsCh)
				defer close(errsCh)
				if err := loader.LoadTxsForAddress(ctx, blockRange, receiverAddr, lib.TONTxBatchSize, txsCh, errsCh); err != nil {
					lggr.Errorw("Failed to load transactions", "error", err)
					errsCh <- err
				}
			}()

			// Handle errors from the loader
			go func() {
				for err := range errsCh {
					lggr.Errorw("Error loading transactions", "error", err)
				}
			}()

			// Process transactions
			for txWithBlock := range txsCh {
				if txWithBlock.Transaction == nil || txWithBlock.Transaction.IO.Out == nil {
					continue
				}

				tx := txWithBlock.Transaction

				// Check for external out messages (emitted events)
				outMsgs, err := tx.IO.Out.ToSlice()
				if err != nil {
					lggr.Warnw("Failed to parse out messages", "error", err)
					continue
				}

				for _, msg := range outMsgs {
					// Only process external out messages (events)
					if msg.MsgType != tlb.MsgTypeExternalOut {
						continue
					}

					extOut := msg.AsExternalOut()
					if extOut == nil {
						continue
					}

					// Extract event topic from destination address
					bucket := tonevent.NewExtOutLogBucket(extOut.DestAddr())
					topic, err := bucket.DecodeEventTopic()
					if err != nil {
						continue
					}

					// Check if this is a Receiver_CCIPMessageReceived event
					if topic != ccip_receiver.CCIPMessageReceivedEventTopic {
						continue
					}

					// Decode the CCIPMessageReceived event
					var event ccip_receiver.CCIPMessageReceived
					if err := tlb.LoadFromCell(&event, extOut.Body.BeginParse()); err != nil {
						lggr.Errorw("Failed to decode CCIPMessageReceived event",
							"error", err,
							"txHash", hex.EncodeToString(tx.Hash),
							"block", txWithBlock.Block.SeqNo)
						return fmt.Errorf("failed to decode CCIPMessageReceived event (struct mismatch?): %w", err)
					}

					receivedMessageID := hex.EncodeToString(event.Message.MessageID[:])

					// Match on messageID if provided
					if messageID != "" && receivedMessageID != messageID {
						continue
					}

					// Decode and match data if expectedData provided
					if expectedData != "" && event.Message.Data != nil {
						dataSlice := event.Message.Data.BeginParse()
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

					lggr.Infow("CCIPMessageReceived event found", "messageID", receivedMessageID, "block", txWithBlock.Block.SeqNo)
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
		return "", errors.New("wallet not initialized")
	}
	return c.wallet.Address().String(), nil
}

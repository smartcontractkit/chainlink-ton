package ton

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/deployment/testadapter"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	ccip_receiver "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/receiver"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	tonlogpoller "github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	tonlploader "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/loader"
	tonlpmodels "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
	tonlpquery "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/query"
	tonlpstore "github.com/smartcontractkit/chainlink-ton/pkg/logpoller/store/memory"
	tonhash "github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"

	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"

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
	client, err := utils.CreateClient(ctx, endpoint)
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

	// Build CCIPSend request
	ccipSend := router.CCIPSend{
		QueryID:           0,
		DestChainSelector: msg.DestChainSel,
		Receiver:          receiverBytes,
		Data:              msg.Data,
		TokenAmounts:      nil,
		FeeToken:          tvm.TonTokenAddr,
		ExtraArgs:         extraArgsCell,
	}

	// Build TON chain
	tonChain := cldfton.Chain{
		ChainMetadata: cldfton.ChainMetadata{
			Selector: c.chainSel,
		},
		Client:        c.client,
		Wallet:        c.wallet,
		WalletAddress: c.wallet.WalletAddress(),
	}

	// Build state provider with Router and FeeQuoter addresses
	stateProvider := &mapStateProvider{
		addresses: map[datastore.ContractType]string{
			"Router":    routerAddr.String(),
			"FeeQuoter": fqAddr.String(),
		},
	}

	// Call SendCCIPMessage from deployment/testadapter
	seqNum, event, err := testadapter.SendCCIPMessage(ctx, tonChain, stateProvider, c.chainSel, ccipSend)
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

	// Setup logpoller service
	eventName := "Receiver_CCIPMessageReceived"
	eventSig := tonhash.CRC32(eventName)
	chainID := strconv.FormatUint(c.chainSel, 10)

	clientProvider := func(ctx context.Context) (ton.APIClientWrapped, error) {
		return c.client.WithRetry(lib.TONClientRetries), nil
	}

	lp, err := tonlogpoller.NewServiceWith(ctx, lggr, chainID, clientProvider,
		&tonlogpoller.ServiceOptions{
			Config:      tonlogpoller.DefaultConfigSet,
			FilterStore: tonlpstore.NewFilterStore(chainID, lggr),
			TxLoader:    tonlploader.New(lggr, clientProvider),
			LogStore:    tonlpstore.NewLogStore(chainID, lggr),
		},
		[]tonlpmodels.Filter{{
			Name:     fmt.Sprintf("%s-%s", receiverAddr.String(), eventName),
			Address:  receiverAddr,
			EventSig: eventSig,
			MsgType:  tlb.MsgTypeExternalOut,
		}},
	)
	if err != nil {
		return fmt.Errorf("failed to create logpoller: %w", err)
	}
	defer lp.Close()

	if err := lp.Start(ctx); err != nil {
		return fmt.Errorf("failed to start logpoller: %w", err)
	}

	// Query configuration
	queryInterval := 500 * time.Millisecond
	progressLogInterval := lib.ProgressLogInterval
	ticker := time.NewTicker(queryInterval)
	defer ticker.Stop()

	progressTicker := time.NewTicker(progressLogInterval)
	defer progressTicker.Stop()

	startTime := time.Now()
	seenEvents := make(map[string]bool)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()

		case <-progressTicker.C:
			lggr.Infow("Still waiting for CCIPReceive",
				"receiver", lib.RedactAddress(receiver),
				"elapsed", time.Since(startTime).Round(time.Second).String())

		case <-ticker.C:
			logs, _, _, err := lp.NewQuery().
				WithSource(receiverAddr).
				WithEventSig(eventSig).
				Execute(ctx)
			if err != nil {
				lggr.Warnw("Failed to query logs", "error", err)
				continue
			}

			events, err := tonlpquery.DecodedLogs[ccip_receiver.CCIPMessageReceived](logs)
			if err != nil {
				lggr.Warnw("Failed to decode logs", "error", err)
				continue
			}

			for _, event := range events {
				// Deduplicate events using tx logical time and message index
				eventKey := fmt.Sprintf("%d-%d", event.TxLT, event.MsgIndex)
				if seenEvents[eventKey] {
					continue
				}
				seenEvents[eventKey] = true
				receivedMessageID := hex.EncodeToString(event.TypedData.Message.MessageID)

				// Match on messageID if provided
				if messageID != "" && receivedMessageID != messageID {
					continue
				}

				// Decode and match data if expectedData provided
				if expectedData != "" && event.TypedData.Message.Data != nil {
					dataSlice := event.TypedData.Message.Data.BeginParse()
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

				lggr.Infow("CCIPMessageReceived event found",
					"messageID", receivedMessageID,
					"txLT", event.TxLT,
					"block", event.Block.SeqNo)
				return nil
			}
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

// mapStateProvider implements testadapters.StateProvider using a simple address map.
type mapStateProvider struct {
	addresses map[datastore.ContractType]string
}

func (p *mapStateProvider) GetAddress(ty datastore.ContractType) (string, error) {
	addr, ok := p.addresses[ty]
	if !ok {
		return "", fmt.Errorf("address not found for contract type: %s", ty)
	}
	return addr, nil
}

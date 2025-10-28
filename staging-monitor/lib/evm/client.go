package evm

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_2_0/router"
	"github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/message_hasher"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"

	"github.com/smartcontractkit/chainlink-ton/staging-monitor/lib"
)

func init() {
	lib.RegisterClientFactory(chainsel.FamilyEVM, NewClient)
}

// Client implements lib.Client for EVM chains
type Client struct {
	chainSel uint64
	lggr     logger.Logger
	client   *ethclient.Client
	wallet   *bind.TransactOpts
}

// NewClient creates a new EVM client
func NewClient(ctx context.Context, lggr logger.Logger, chainSel uint64, endpoint string, walletKey string) (lib.Client, error) {
	client, err := ethclient.Dial(endpoint)
	if err != nil {
		return nil, fmt.Errorf("failed to dial EVM RPC: %w", err)
	}

	c := &Client{
		chainSel: chainSel,
		lggr:     lggr,
		client:   client,
	}

	if walletKey != "" {
		pk, err := crypto.HexToECDSA(strings.TrimPrefix(walletKey, "0x"))
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key: %w", err)
		}

		chainID, err := client.ChainID(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to get chain ID: %w", err)
		}

		auth, err := bind.NewKeyedTransactorWithChainID(pk, chainID)
		if err != nil {
			return nil, fmt.Errorf("failed to create transactor: %w", err)
		}

		c.wallet = auth

		balance, _ := client.BalanceAt(ctx, auth.From, nil)
		lggr.Infow("EVM wallet initialized",
			"address", lib.RedactAddress(auth.From.Hex()),
			"balance", formatETH(balance))
	}

	return c, nil
}

func (c *Client) ChainSelector() uint64 {
	return c.chainSel
}

// TODO: externalize message configurations to cover more scenarios(tokens, gas, etc)
func (c *Client) SendMessage(ctx context.Context, lggr logger.Logger, msg lib.MessageToSend) (*lib.SendResult, error) {
	routerAddr := common.HexToAddress(msg.Router)

	// Parse receiver address using TON address codec
	addrCodec := codec.NewAddressCodec()
	receiverBytes, err := addrCodec.AddressStringToBytes(msg.Receiver)
	if err != nil {
		return nil, fmt.Errorf("failed to parse receiver address: %w", err)
	}

	// Parse router ABI
	parsedABI, err := abi.JSON(strings.NewReader(RouterABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse router ABI: %w", err)
	}

	// Build extra args manually
	extraArgsBytes, err := buildEVMExtraArgsV2(message_hasher.ClientGenericExtraArgsV2{
		GasLimit:                 big.NewInt(lib.EVMDefaultGasLimit),
		AllowOutOfOrderExecution: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to build extra args: %w", err)
	}

	// Construct EVM2AnyMessage
	message := router.ClientEVM2AnyMessage{
		Receiver:     receiverBytes,
		Data:         msg.Data,
		TokenAmounts: []router.ClientEVMTokenAmount{},
		FeeToken:     common.Address{},
		ExtraArgs:    extraArgsBytes,
	}

	// Get fee
	callData, err := parsedABI.Pack("getFee", msg.DestChainSel, message)
	if err != nil {
		return nil, fmt.Errorf("failed to pack getFee call: %w", err)
	}

	result, err := c.client.CallContract(ctx, ethereum.CallMsg{
		To:   &routerAddr,
		Data: callData,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to call getFee: %w", err)
	}

	fee := new(big.Int).SetBytes(result)
	lggr.Infow("CCIP message fee", "fee", formatETH(fee))

	// Create bound contract instance
	boundContract := bind.NewBoundContract(routerAddr, parsedABI, c.client, c.client, c.client)

	// Set transaction options
	c.wallet.Value = fee
	c.wallet.Context = ctx
	c.wallet.GasLimit = lib.EVMTransactionGasLimit

	// Call ccipSend
	tx, err := boundContract.Transact(c.wallet, "ccipSend", msg.DestChainSel, message)
	if err != nil {
		c.wallet.Value = nil
		return nil, fmt.Errorf("failed to send CCIP message: %w", err)
	}

	// Reset value to nil
	c.wallet.Value = nil

	lggr.Infow("Transaction sent", "txHash", tx.Hash().Hex())

	// Wait for receipt
	receipt, err := bind.WaitMined(ctx, c.client, tx)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for transaction: %w", err)
	}

	if receipt.Status != types.ReceiptStatusSuccessful {
		return nil, fmt.Errorf("transaction failed with status %d", receipt.Status)
	}

	lggr.Infow("Transaction confirmed", "blockNumber", receipt.BlockNumber.Uint64())

	// Extract sequence number and messageID from CCIPMessageSent event
	seqNum, messageID, err := extractFromCCIPMessageSent(receipt)
	if err != nil {
		return nil, fmt.Errorf("failed to extract from CCIPMessageSent event: %w", err)
	}

	return &lib.SendResult{
		SeqNum:    seqNum,
		MessageID: messageID,
		TxHash:    tx.Hash().Hex()[2:], // Remove 0x prefix
		BlockNum:  receipt.BlockNumber.Uint64(),
	}, nil
}

func (c *Client) GetCurrentBlock(ctx context.Context) (uint64, error) {
	return c.client.BlockNumber(ctx)
}

func (c *Client) WaitForMessageReceived(ctx context.Context, lggr logger.Logger, receiver string, messageID string, expectedData string, startBlock uint64) error {
	receiverAddr := common.HexToAddress(receiver)

	lggr.Infow("Waiting for MessageReceived event",
		"receiver", lib.RedactAddress(receiverAddr.Hex()),
		"messageID", messageID)

	parsedABI, err := abi.JSON(strings.NewReader(MessageReceivedEventABI))
	if err != nil {
		return fmt.Errorf("failed to parse MessageReceived ABI: %w", err)
	}

	ev, ok := parsedABI.Events["MessageReceived"]
	if !ok {
		return errors.New("MessageReceived event not in ABI")
	}
	topic := ev.ID

	ticker := time.NewTicker(lib.PollInterval)
	defer ticker.Stop()

	lastProgressLog := time.Now()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()

		case <-ticker.C:
			head, err := c.client.BlockNumber(ctx)
			if err != nil {
				lggr.Warnw("BlockNumber error", "error", err)
				continue
			}

			if startBlock > head {
				continue
			}

			toBlock := startBlock + lib.EVMLogQuerySpan - 1
			if toBlock > head {
				toBlock = head
			}

			q := ethereum.FilterQuery{
				FromBlock: new(big.Int).SetUint64(startBlock),
				ToBlock:   new(big.Int).SetUint64(toBlock),
				Addresses: []common.Address{receiverAddr},
				Topics:    [][]common.Hash{{topic}},
			}

			logs, err := c.client.FilterLogs(ctx, q)
			if err != nil {
				lggr.Warnw("FilterLogs error", "error", err)
				continue
			}

			// Progress log every 15 seconds
			if time.Since(lastProgressLog) > lib.ProgressLogInterval {
				lggr.Infow("Still waiting for MessageReceived", "currentBlock", head, "searchingFrom", startBlock)
				lastProgressLog = time.Now()
			}

			nextStart := toBlock + 1

			for _, lg := range logs {
				if lg.BlockNumber+1 > nextStart {
					nextStart = lg.BlockNumber + 1
				}

				var decoded MessageReceivedEvent
				if err := parsedABI.UnpackIntoInterface(&decoded, "MessageReceived", lg.Data); err != nil {
					continue
				}

				gotData := string(decoded.Data)
				gotMessageID := hex.EncodeToString(decoded.MessageID[:])

				// Match on messageID if provided, otherwise match on data
				if messageID != "" && gotMessageID != messageID {
					continue
				}

				if gotData != expectedData {
					continue
				}

				lggr.Infow("MessageReceived event found", "messageID", gotMessageID, "block", lg.BlockNumber)
				return nil
			}

			startBlock = nextStart
		}
	}
}

func (c *Client) GetBalance(ctx context.Context, address string) (string, error) {
	addr := common.HexToAddress(address)
	balance, err := c.client.BalanceAt(ctx, addr, nil)
	if err != nil {
		return "", fmt.Errorf("failed to get balance: %w", err)
	}
	return formatETH(balance), nil
}

func (c *Client) GetWalletAddress() (string, error) {
	if c.wallet == nil {
		return "", errors.New("wallet not initialized")
	}
	return c.wallet.From.Hex(), nil
}

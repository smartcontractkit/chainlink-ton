package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib"
	_ "github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib/evm"
	_ "github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib/ton"
)

func main() {
	result := lib.TestResult{
		Case:   "messaging-evm2ton",
		Status: "failure",
	}

	lggr, err := logger.New()
	if err != nil {
		result.Error = fmt.Sprintf("Failed to create logger: %v", err)
		outputJSON(result)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), lib.TestTimeout)
	defer cancel()

	// Parse selectors
	srcChainSel, err := strconv.ParseUint(os.Getenv("ETHEREUM_TESTNET_SEPOLIA_SELECTOR"), 10, 64)
	if err != nil {
		result.Error = "ETHEREUM_TESTNET_SEPOLIA_SELECTOR not set or invalid"
		outputJSON(result)
		os.Exit(1)
	}
	destChainSel, err := strconv.ParseUint(os.Getenv("TON_TESTNET_SELECTOR"), 10, 64)
	if err != nil {
		result.Error = "TON_TESTNET_SELECTOR not set or invalid"
		outputJSON(result)
		os.Exit(1)
	}

	// Load args
	args, err := lib.LoadArgs(srcChainSel, destChainSel)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to load args: %v", err)
		outputJSON(result)
		os.Exit(1)
	}

	result.Router = args.SrcRouter
	result.Receiver = args.DestReceiver
	result.Data = args.MessageData

	// Setup context
	testCtx, err := lib.SetupContext(ctx, lggr, args)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to setup context: %v", err)
		outputJSON(result)
		os.Exit(1)
	}

	// Get sender balance
	senderAddr, err := testCtx.Source.GetWalletAddress(ctx)
	if err != nil {
		lggr.Warnw("Failed to get sender address", "error", err)
	} else {
		result.SenderAddress = senderAddr
		balance, err := testCtx.Source.GetBalance(ctx, senderAddr)
		if err != nil {
			lggr.Warnw("Failed to get sender balance", "error", err)
		} else {
			result.SenderBalance = balance
		}
	}

	// Get starting block
	startBlock, err := testCtx.Dest.GetCurrentBlock(ctx)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to get current block: %v", err)
		outputJSON(result)
		os.Exit(1)
	}

	// Send message
	lggr.Info("Sending CCIP message from EVM to TON")
	startTime := time.Now()

	sendResult, err := testCtx.SendMessage(ctx, lggr, []byte(args.MessageData))
	if err != nil {
		result.Error = fmt.Sprintf("Failed to send message: %v", err)
		outputJSON(result)
		os.Exit(1)
	}

	result.MessageID = sendResult.MessageID
	lggr.Infow("Message sent", "seqNum", sendResult.SeqNum, "messageID", sendResult.MessageID, "txHash", sendResult.TxHash)

	// Wait for message received
	err = testCtx.WaitForMessageReceived(ctx, lggr, sendResult.MessageID, args.MessageData, startBlock)
	if err != nil {
		result.Error = fmt.Sprintf("Failed waiting for message: %v", err)
		outputJSON(result)
		os.Exit(1)
	}

	// Calculate latency
	duration := time.Since(startTime)
	result.LatencySeconds = int64(duration.Seconds())
	result.LatencyFormatted = lib.FormatDuration(duration)

	lggr.Infow("Test passed", "latency", result.LatencyFormatted)
	result.Status = "success"
	outputJSON(result)
}

func outputJSON(result lib.TestResult) {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	encoder.Encode(result)
}

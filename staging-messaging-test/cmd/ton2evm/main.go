package main

import (
	"context"
	"flag"
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
	resultFile := flag.String("result-file", "result.json", "Path to write test result JSON")
	flag.Parse()

	resultPath := lib.GetResultFilePath(*resultFile)

	result := lib.TestResult{
		Case:   "messaging-ton2evm",
		Status: "failure", // default to failure, set to success on pass
	}

	exitCode := 0

	lggr, err := logger.New()
	if err != nil {
		result.Error = fmt.Sprintf("Failed to create logger: %v", err)
		lib.OutputJSON(result, resultPath)
		os.Exit(1)
	}

	func() {
		ctx, cancel := context.WithTimeout(context.Background(), lib.TestTimeout)
		defer cancel()

		if err := runTON2EVM(ctx, lggr, &result); err != nil {
			exitCode = 1
		}
	}()

	lib.OutputJSON(result, resultPath)
	os.Exit(exitCode)
}

func runTON2EVM(ctx context.Context, lggr logger.Logger, result *lib.TestResult) error {
	// Parse selectors
	srcChainSel, err := strconv.ParseUint(os.Getenv("TON_TESTNET_SELECTOR"), 10, 64)
	if err != nil {
		result.Error = "TON_TESTNET_SELECTOR not set or invalid"
		lggr.Errorw("Failed to parse source chain selector", "error", err)
		return err
	}
	destChainSel, err := strconv.ParseUint(os.Getenv("ETHEREUM_TESTNET_SEPOLIA_SELECTOR"), 10, 64)
	if err != nil {
		result.Error = "ETHEREUM_TESTNET_SEPOLIA_SELECTOR not set or invalid"
		lggr.Errorw("Failed to parse destination chain selector", "error", err)
		return err
	}

	// Load args
	args, err := lib.LoadArgs(srcChainSel, destChainSel)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to load args: %v", err)
		lggr.Errorw("Failed to load args", "error", err)
		return err
	}

	result.Router = args.SrcRouter
	result.Receiver = args.DestReceiver
	result.Data = args.MessageData

	// Setup context
	testCtx, err := lib.SetupContext(ctx, lggr, args)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to setup context: %v", err)
		lggr.Errorw("Failed to setup context", "error", err)
		return err
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
		lggr.Errorw("Failed to get current block", "error", err)
		return err
	}

	// Send message
	lggr.Info("Sending CCIP message from TON to EVM")
	startTime := time.Now()

	sendResult, err := testCtx.SendMessage(ctx, lggr, []byte(args.MessageData))
	if err != nil {
		result.Error = fmt.Sprintf("Failed to send message: %v", err)
		lggr.Errorw("Failed to send message", "error", err)
		return err
	}

	result.MessageID = sendResult.MessageID
	lggr.Infow("Message sent", "seqNum", sendResult.SeqNum, "messageID", sendResult.MessageID)

	// Wait for message received
	err = testCtx.WaitForMessageReceived(ctx, lggr, sendResult.MessageID, args.MessageData, startBlock)
	if err != nil {
		result.Error = fmt.Sprintf("Failed waiting for message: %v", err)
		lggr.Errorw("Failed waiting for message", "error", err)
		return err
	}

	// Calculate latency
	duration := time.Since(startTime)
	result.LatencySeconds = int64(duration.Seconds())
	result.LatencyFormatted = lib.FormatDuration(duration)

	lggr.Infow("Test passed", "latency", result.LatencyFormatted)
	result.Status = "success"
	return nil
}

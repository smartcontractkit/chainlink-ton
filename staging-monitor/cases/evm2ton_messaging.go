package cases

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/staging-monitor/lib"
)

// EVM2TONMessaging executes the EVM to TON messaging test case
func EVM2TONMessaging(ctx context.Context, lggr logger.Logger) (*lib.TestResult, error) {
	result := &lib.TestResult{
		Case:   "messaging-evm2ton",
		Status: "failure", // default to failure, set to success on pass
	}

	lib.TryLoadEnvFile()

	// Parse selectors
	srcChainSel, err := strconv.ParseUint(os.Getenv("ETHEREUM_TESTNET_SEPOLIA_SELECTOR"), 10, 64)
	if err != nil {
		result.Error = "ETHEREUM_TESTNET_SEPOLIA_SELECTOR not set or invalid"
		lggr.Errorw("Failed to parse source chain selector", "error", err)
		return result, err
	}
	destChainSel, err := strconv.ParseUint(os.Getenv("TON_TESTNET_SELECTOR"), 10, 64)
	if err != nil {
		result.Error = "TON_TESTNET_SELECTOR not set or invalid"
		lggr.Errorw("Failed to parse destination chain selector", "error", err)
		return result, err
	}

	// Load args
	args, err := lib.LoadArgs(srcChainSel, destChainSel)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to load args: %v", err)
		lggr.Errorw("Failed to load args", "error", err)
		return result, err
	}

	// Initialize test metadata (available even on failure for reporting)
	result.Router = args.SrcRouter
	result.Receiver = args.DestReceiver
	result.Data = args.MessageData

	// Setup context
	testCtx, err := lib.SetupContext(ctx, lggr, args)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to setup context: %v", err)
		lggr.Errorw("Failed to setup context", "error", err)
		return result, err
	}

	// Get sender balance (optional, for reporting)
	senderAddr, err := testCtx.Source.GetWalletAddress()
	senderBalance := ""
	if err != nil {
		lggr.Warnw("Failed to get sender address", "error", err)
	} else if senderAddr != "" {
		balance, balanceErr := testCtx.Source.GetBalance(ctx, senderAddr)
		if balanceErr != nil {
			lggr.Warnw("Failed to get sender balance", "error", balanceErr)
		} else {
			senderBalance = balance
		}
	}
	result.SenderAddress = senderAddr
	result.SenderBalance = senderBalance

	// Get starting block
	startBlock, err := testCtx.Dest.GetCurrentBlock(ctx)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to get current block: %v", err)
		lggr.Errorw("Failed to get current block", "error", err)
		return result, err
	}

	// Send message
	lggr.Info("Sending CCIP message from EVM to TON")
	startTime := time.Now()

	sendResult, err := testCtx.SendMessage(ctx, lggr, []byte(args.MessageData))
	if err != nil {
		result.Error = fmt.Sprintf("Failed to send message: %v", err)
		lggr.Errorw("Failed to send message", "error", err)
		return result, err
	}

	lggr.Infow("Message sent", "seqNum", sendResult.SeqNum, "messageID", sendResult.MessageID, "txHash", sendResult.TxHash)
	result.MessageID = sendResult.MessageID

	// Wait for message received
	err = testCtx.WaitForMessageReceived(ctx, lggr, sendResult.MessageID, args.MessageData, startBlock)
	if err != nil {
		result.Error = fmt.Sprintf("Failed waiting for message: %v", err)
		lggr.Errorw("Failed waiting for message", "error", err)
		return result, err
	}

	result.Status = "success"

	duration := time.Since(startTime)
	result.LatencySeconds = int64(duration.Seconds())
	result.LatencyFormatted = lib.FormatDuration(duration)

	lggr.Infow("Test passed", "latency", result.LatencyFormatted)
	return result, nil
}

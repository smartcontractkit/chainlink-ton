package tests

import (
	"context"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib"
	_ "github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib/evm"
	_ "github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib/ton"
)

func Test_EVM2TON(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), lib.TestTimeout)
	defer cancel()

	lggr, err := logger.New()
	require.NoError(t, err, "failed to create logger")

	// Read selectors from environment
	evmSelector, err := strconv.ParseUint(os.Getenv("ETHEREUM_TESTNET_SEPOLIA_SELECTOR"), 10, 64)
	require.NoError(t, err, "ETHEREUM_TESTNET_SEPOLIA_SELECTOR not set or invalid")
	tonSelector, err := strconv.ParseUint(os.Getenv("TON_TESTNET_SELECTOR"), 10, 64)
	require.NoError(t, err, "TON_TESTNET_SELECTOR not set or invalid")

	args, err := lib.LoadArgs(evmSelector, tonSelector)
	require.NoError(t, err)
	tc, err := lib.SetupContext(ctx, lggr, args)
	require.NoError(t, err)

	startTime := time.Now()

	startBlock, err := tc.Dest.GetCurrentBlock(ctx)
	require.NoError(t, err)

	lggr.Info("Sending CCIP message from EVM to TON")
	result, err := tc.SendMessage(ctx, lggr, []byte(args.MessageData))
	require.NoError(t, err)
	lggr.Infow("Message sent", "seqNum", result.SeqNum, "messageID", result.MessageID, "txHash", result.TxHash)

	err = tc.WaitForMessageReceived(ctx, lggr, result.MessageID, args.MessageData, startBlock)
	require.NoError(t, err)

	lggr.Infow("Test passed", "duration", time.Since(startTime))
}

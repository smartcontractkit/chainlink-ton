package tests

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib"
	_ "github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib/evm"
	_ "github.com/smartcontractkit/chainlink-ton/staging-messaging-test/lib/ton"
)

func Test_TON2EVM(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), lib.TestTimeout)
	defer cancel()

	lggr, err := logger.New()
	require.NoError(t, err, "failed to create logger")

	args, err := lib.LoadArgs(lib.TONTestnetSelector, lib.EVMSepoliaSelector)
	require.NoError(t, err)
	tc, err := lib.SetupContext(ctx, lggr, args)
	require.NoError(t, err)

	startTime := time.Now()

	startBlock, err := tc.Dest.GetCurrentBlock(ctx)
	require.NoError(t, err)

	lggr.Info("Sending CCIP message from TON to EVM")
	result, err := tc.SendMessage(ctx, lggr, []byte(args.MessageData))
	require.NoError(t, err)
	lggr.Infow("Message sent", "seqNum", result.SeqNum, "messageID", result.MessageID)

	err = tc.WaitForMessageReceived(ctx, lggr, result.MessageID, args.MessageData, startBlock)
	require.NoError(t, err)

	lggr.Infow("Test passed", "duration", time.Since(startTime))
}

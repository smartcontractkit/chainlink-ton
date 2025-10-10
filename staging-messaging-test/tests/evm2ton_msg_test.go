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

func Test_EVM2TON(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), lib.TestTimeout)
	defer cancel()

	lggr, err := logger.New()
	require.NoError(t, err, "failed to create logger")

	args := lib.LoadArgs(t, lib.EVMSepoliaSelector, lib.TONTestnetSelector)
	tc := lib.SetupContext(ctx, t, lggr, args)

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

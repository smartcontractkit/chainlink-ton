package tracetracking_test

import (
	"context"
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking/tracetest"
)

var (
	wallet   = tracetest.Addr(1)
	contract = tracetest.Addr(2)
	pingA    = tracetest.Addr(3)
	pingB    = tracetest.Addr(4)
	other    = tracetest.Addr(5)
)

func mapRoot(t *testing.T, tx tracetest.Tx) *tracetracking.ReceivedMessage {
	t.Helper()
	root, err := tracetracking.MapToReceivedMessage(tx.Transaction)
	require.NoError(t, err)
	return &root
}

// buildPingPong records wallet -> contract, which sends to pingA and to other. pingA and pingB then
// message each other hops times, and the last message is never received.
func buildPingPong(t *testing.T, chain *tracetest.Chain, hops int) *tracetracking.ReceivedMessage {
	t.Helper()

	in := chain.Send(wallet, contract, tracetest.Body(1))
	pingBody := tracetest.Body(2)
	rootTx := chain.Receive(in,
		tracetest.Out{Dst: pingA, Body: pingBody},
		tracetest.Out{Dst: other, Body: tracetest.Body(3)},
	)
	pingMsg, toOther := rootTx.Out[0], rootTx.Out[1]
	chain.Receive(toOther)

	nextReceiver := pingB
	for range hops {
		pong := chain.Receive(pingMsg, tracetest.Out{Dst: nextReceiver, Body: pingBody})
		pingMsg, nextReceiver = pong.Out[0], pingMsg.DstAddr
	}

	return mapRoot(t, rootTx)
}

func TestWaitForTrace_FollowsWholeTrace(t *testing.T) {
	chain := tracetest.NewChain(t)
	in := chain.Send(wallet, contract, tracetest.Body(1))
	rootTx := chain.Receive(in,
		tracetest.Out{Dst: pingA, Body: tracetest.Body(2)},
		tracetest.Out{Dst: other, Body: tracetest.Body(3)},
	)
	pingATx := chain.Receive(rootTx.Out[0], tracetest.Out{Dst: pingB, Body: tracetest.Body(4)})
	chain.Receive(rootTx.Out[1])
	chain.Receive(pingATx.Out[0])

	root := mapRoot(t, rootTx)
	require.NoError(t, root.WaitForTrace(t.Context(), chain))

	require.Equal(t, tracetracking.Finalized, root.Status())
	require.Len(t, root.OutgoingInternalReceivedMessages, 2)
	require.Empty(t, root.OutgoingInternalSkippedMessages)
	require.Len(t, root.OutgoingInternalReceivedMessages[0].OutgoingInternalReceivedMessages, 1)
	require.True(t, root.TraceSucceeded())
}

func TestWaitForTrace_TimesOutOnUnboundedTrace(t *testing.T) {
	chain := tracetest.NewChain(t)
	root := buildPingPong(t, chain, 5)

	ctx, cancel := context.WithTimeout(t.Context(), 200*time.Millisecond)
	defer cancel()

	require.ErrorIs(t, root.WaitForTrace(ctx, chain), context.DeadlineExceeded)
}

func TestWaitForTraceWith_SkipsDeclinedBranches(t *testing.T) {
	chain := tracetest.NewChain(t)
	root := buildPingPong(t, chain, 5)

	// Decline everything pingA sends, so the ping-pong is never waited for.
	var seenPaths [][]*tracetracking.ReceivedMessage
	follow := func(path []*tracetracking.ReceivedMessage, out *tracetracking.SentMessage) (bool, error) {
		seenPaths = append(seenPaths, path)
		return !out.InternalMsg.SrcAddr.Equals(pingA), nil
	}

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	require.NoError(t, root.WaitForTraceWith(ctx, chain, follow))

	require.Equal(t, tracetracking.Finalized, root.Status())
	require.Len(t, root.OutgoingInternalReceivedMessages, 2)
	toPing := root.OutgoingInternalReceivedMessages[0]
	require.True(t, toPing.InternalMsg.DstAddr.Equals(pingA))
	require.Empty(t, toPing.OutgoingInternalSentMessages)
	require.Empty(t, toPing.OutgoingInternalReceivedMessages)
	require.Len(t, toPing.OutgoingInternalSkippedMessages, 1)
	require.True(t, toPing.OutgoingInternalSkippedMessages[0].InternalMsg.DstAddr.Equals(pingB))

	// pingB was never subscribed to.
	require.NotContains(t, chain.Searched(), pingB.String())

	// Paths run from the root down to the sender of the evaluated message.
	require.Len(t, seenPaths, 3)
	require.Equal(t, []*tracetracking.ReceivedMessage{root}, seenPaths[0])
	require.Equal(t, []*tracetracking.ReceivedMessage{root}, seenPaths[1])
	require.Equal(t, []*tracetracking.ReceivedMessage{root, toPing}, seenPaths[2])

	// Skipped messages still count towards the sender's fees and outgoing amount.
	skipped := toPing.OutgoingInternalSkippedMessages[0]
	require.Equal(t, 0, toPing.TotalActionPhaseFees().Cmp(new(big.Int).Add(toPing.TotalActionFees, skipped.FwdFee)))
	require.Equal(t, 0, toPing.OutgoingAmount().Cmp(skipped.Amount))
}

func TestWaitForTraceWith_NilFollowsAll(t *testing.T) {
	chain := tracetest.NewChain(t)
	root := buildPingPong(t, chain, 2)

	ctx, cancel := context.WithTimeout(t.Context(), 200*time.Millisecond)
	defer cancel()

	require.ErrorIs(t, root.WaitForTraceWith(ctx, chain, nil), context.DeadlineExceeded)
}

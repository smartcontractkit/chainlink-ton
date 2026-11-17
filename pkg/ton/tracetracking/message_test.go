package tracetracking_test

import (
	"context"
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
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

func TestWaitForTrace_ResumesAfterTimeout(t *testing.T) {
	chain := tracetest.NewChain(t)
	in := chain.Send(wallet, contract, tracetest.Body(1))
	rootTx := chain.Receive(in, tracetest.Out{Dst: pingA, Body: tracetest.Body(2)})
	pingATx := chain.Receive(rootTx.Out[0], tracetest.Out{Dst: pingB, Body: tracetest.Body(3)})
	root := mapRoot(t, rootTx)

	// pingB has not received its message yet.
	ctx, cancel := context.WithTimeout(t.Context(), 200*time.Millisecond)
	defer cancel()
	require.ErrorIs(t, root.WaitForTrace(ctx, chain), context.DeadlineExceeded)

	// The root's own messages are all received, but the trace is not complete.
	require.Empty(t, root.OutgoingInternalSentMessages)
	require.Equal(t, tracetracking.Finalized, root.Status())
	require.Equal(t, tracetracking.TraceCascading, root.TraceStatus())
	toPing := root.OutgoingInternalReceivedMessages[0]
	require.Len(t, toPing.OutgoingInternalSentMessages, 1, "the message pingB has not received stays pending")
	require.Empty(t, toPing.OutgoingInternalReceivedMessages)

	// Waiting again once pingB receives it completes the trace.
	chain.Receive(pingATx.Out[0])
	ctx, cancel = context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	require.NoError(t, root.WaitForTrace(ctx, chain))

	require.Equal(t, tracetracking.TraceFinalized, root.TraceStatus())
	require.Empty(t, toPing.OutgoingInternalSentMessages)
	require.Len(t, toPing.OutgoingInternalReceivedMessages, 1)
	require.True(t, toPing.OutgoingInternalReceivedMessages[0].InternalMsg.DstAddr.Equals(pingB))
}

func TestTraceStatus(t *testing.T) {
	chain := tracetest.NewChain(t)
	in := chain.Send(wallet, contract, tracetest.Body(1))
	rootTx := chain.Receive(in, tracetest.Out{Dst: pingA, Body: tracetest.Body(2)})
	root := mapRoot(t, rootTx)
	require.Equal(t, tracetracking.TraceReceived, root.TraceStatus())

	leaf := mapRoot(t, chain.Receive(chain.Send(wallet, contract, tracetest.Body(1))))
	require.Equal(t, tracetracking.TraceFinalized, leaf.TraceStatus())

	child := mapRoot(t, chain.Receive(rootTx.Out[0], tracetest.Out{Dst: pingB, Body: tracetest.Body(3)}))
	root.OutgoingInternalSentMessages = nil
	root.OutgoingInternalReceivedMessages = []*tracetracking.ReceivedMessage{child}
	require.Equal(t, tracetracking.TraceCascading, root.TraceStatus(), "a message two hops down is pending")
	require.Equal(t, tracetracking.Finalized, root.Status(), "Status only considers the root's own messages")

	child.OutgoingInternalSkippedMessages = child.OutgoingInternalSentMessages
	child.OutgoingInternalSentMessages = nil
	require.Equal(t, tracetracking.TraceFinalized, root.TraceStatus(), "skipped messages are not pending")
}

func TestWaitForTraceWith_NilFollowsAll(t *testing.T) {
	chain := tracetest.NewChain(t)
	root := buildPingPong(t, chain, 2)

	ctx, cancel := context.WithTimeout(t.Context(), 200*time.Millisecond)
	defer cancel()

	require.ErrorIs(t, root.WaitForTraceWith(ctx, chain, nil), context.DeadlineExceeded)
}

func vmPhase(success bool, exitCode int32) tlb.ComputePhase {
	return tlb.ComputePhase{Phase: tlb.ComputePhaseVM{
		Success: success,
		Details: tlb.ComputePhaseVMDetails{ExitCode: exitCode},
	}}
}

func skippedPhase(reason tlb.ComputeSkipReasonType) tlb.ComputePhase {
	return tlb.ComputePhase{Phase: tlb.ComputePhaseSkipped{Reason: tlb.ComputeSkipReason{Type: reason}}}
}

func actionPhase(success bool, resultCode int32) *tlb.ActionPhase {
	return &tlb.ActionPhase{Success: success, ResultCode: resultCode}
}

var (
	succeededDescription = &tlb.TransactionDescriptionOrdinary{
		ComputePhase: vmPhase(true, 0),
		ActionPhase:  actionPhase(true, 0),
	}
	actionFailedDescription = &tlb.TransactionDescriptionOrdinary{
		ComputePhase: vmPhase(true, 0),
		ActionPhase:  actionPhase(false, int32(tvm.ExitCodeNotEnoughToncoin)),
		Aborted:      true,
	}
	computeFailedDescription = &tlb.TransactionDescriptionOrdinary{
		ComputePhase: vmPhase(false, 100),
		Aborted:      true,
	}
)

func TestReceivedMessage_Outcome(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		description   *tlb.TransactionDescriptionOrdinary
		wantSucceeded bool
		wantResult    tracetracking.Result
		wantExitCode  tvm.ExitCode
		wantErr       string
	}{
		{
			name:          "compute and action succeeded",
			description:   succeededDescription,
			wantSucceeded: true,
			wantResult:    tracetracking.ResultSuccess,
			wantExitCode:  tvm.ExitCodeSuccess,
		},
		{
			name:          "compute failed",
			description:   computeFailedDescription,
			wantSucceeded: false,
			wantResult:    tracetracking.ResultComputeFailed,
			wantExitCode:  100,
		},
		{
			name:          "compute succeeded but action phase failed",
			description:   actionFailedDescription,
			wantSucceeded: false,
			wantResult:    tracetracking.ResultActionFailed,
			wantExitCode:  tvm.ExitCodeNotEnoughToncoin,
		},
		{
			name:          "compute failed with an exit code shared with action result codes",
			description:   &tlb.TransactionDescriptionOrdinary{ComputePhase: vmPhase(false, int32(tvm.ExitCodeNotEnoughToncoin)), Aborted: true},
			wantSucceeded: false,
			wantResult:    tracetracking.ResultComputeFailed,
			wantExitCode:  tvm.ExitCodeNotEnoughToncoin,
		},
		{
			name:          "compute skipped",
			description:   &tlb.TransactionDescriptionOrdinary{ComputePhase: skippedPhase(tlb.ComputeSkipReasonNoState), Aborted: true},
			wantSucceeded: false,
			wantResult:    tracetracking.ResultComputeSkipped,
			wantExitCode:  tvm.ExitCodeComputeSkipReasonNoState,
		},
		{
			name:          "compute skipped for unknown reason",
			description:   &tlb.TransactionDescriptionOrdinary{ComputePhase: skippedPhase("UNKNOWN"), Aborted: true},
			wantSucceeded: false,
			wantErr:       `compute phase skipped for unknown reason "UNKNOWN"`,
		},
		{
			name:          "no description",
			description:   nil,
			wantSucceeded: false,
			wantErr:       "no description in transaction",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			msg := &tracetracking.ReceivedMessage{Description: tt.description}

			require.Equal(t, tt.wantSucceeded, msg.Succeeded())

			result, resultExitCode, resultErr := msg.Result()
			exitCode, exitCodeErr := msg.ExitCode()
			if tt.wantErr != "" {
				require.ErrorContains(t, resultErr, tt.wantErr)
				require.ErrorContains(t, exitCodeErr, tt.wantErr)
				require.Equal(t, tracetracking.ResultUnknown, result)
				return
			}
			require.NoError(t, resultErr)
			require.NoError(t, exitCodeErr)
			require.Equal(t, tt.wantResult, result)
			require.Equal(t, tt.wantExitCode, resultExitCode)
			require.Equal(t, tt.wantExitCode, exitCode)
		})
	}
}

func TestReceivedMessage_TraceOutcome(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		root          *tracetracking.ReceivedMessage
		wantSucceeded bool
		wantResult    tracetracking.Result
		wantExitCode  tvm.ExitCode
	}{
		{
			name: "all messages succeeded",
			root: &tracetracking.ReceivedMessage{
				Description:                      succeededDescription,
				OutgoingInternalReceivedMessages: []*tracetracking.ReceivedMessage{{Description: succeededDescription}},
			},
			wantSucceeded: true,
			wantResult:    tracetracking.ResultSuccess,
			wantExitCode:  tvm.ExitCodeSuccess,
		},
		{
			name:          "root action phase failure",
			root:          &tracetracking.ReceivedMessage{Description: actionFailedDescription},
			wantSucceeded: false,
			wantResult:    tracetracking.ResultActionFailed,
			wantExitCode:  tvm.ExitCodeNotEnoughToncoin,
		},
		{
			name: "descendant action phase failure",
			root: &tracetracking.ReceivedMessage{
				Description: succeededDescription,
				OutgoingInternalReceivedMessages: []*tracetracking.ReceivedMessage{
					{Description: succeededDescription},
					{Description: actionFailedDescription},
				},
			},
			wantSucceeded: false,
			wantResult:    tracetracking.ResultActionFailed,
			wantExitCode:  tvm.ExitCodeNotEnoughToncoin,
		},
		{
			name: "first failure in traversal order is reported",
			root: &tracetracking.ReceivedMessage{
				Description: succeededDescription,
				OutgoingInternalReceivedMessages: []*tracetracking.ReceivedMessage{
					{Description: computeFailedDescription},
					{Description: actionFailedDescription},
				},
			},
			wantSucceeded: false,
			wantResult:    tracetracking.ResultComputeFailed,
			wantExitCode:  100,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			require.Equal(t, tt.wantSucceeded, tt.root.TraceSucceeded())

			result, exitCode, err := tt.root.TraceResult()
			require.NoError(t, err)
			require.Equal(t, tt.wantResult, result)
			require.Equal(t, tt.wantExitCode, exitCode)

			traceExitCode, err := tt.root.TraceExitCode()
			require.NoError(t, err)
			require.Equal(t, tt.wantExitCode, traceExitCode)
		})
	}

	t.Run("boundary skips failing branch", func(t *testing.T) {
		t.Parallel()
		failing := &tracetracking.ReceivedMessage{Description: actionFailedDescription}
		root := &tracetracking.ReceivedMessage{
			Description:                      succeededDescription,
			OutgoingInternalReceivedMessages: []*tracetracking.ReceivedMessage{failing},
		}
		skipFailing := func(_, current *tracetracking.ReceivedMessage) (bool, error) { return current == failing, nil }

		result, exitCode, err := root.TraceResultWith(skipFailing)
		require.NoError(t, err)
		require.Equal(t, tracetracking.ResultSuccess, result)
		require.Equal(t, tvm.ExitCodeSuccess, exitCode)
	})

	t.Run("nil message", func(t *testing.T) {
		t.Parallel()
		var root *tracetracking.ReceivedMessage

		result, _, err := root.TraceResult()
		require.ErrorContains(t, err, "nil ReceivedMessage")
		require.Equal(t, tracetracking.ResultUnknown, result)
	})
}

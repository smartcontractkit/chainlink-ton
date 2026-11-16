package bindings_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking/tracetest"
)

var (
	transmitter = tracetest.Addr(1)
	offRampAddr = tracetest.Addr(2)
	routerAddr  = tracetest.Addr(3)
	receiver    = tracetest.Addr(4)
	executor    = tracetest.Addr(5)
	attacker    = tracetest.Addr(6)
)

const (
	opExecute      = 0x1001
	opRoute        = 0x1002
	opExcess       = 0x1003
	opToOffRamp    = 0x1004
	opToExecutor   = 0x1005
	opUnknown      = 0x1006
	opRichBounce   = 0xfffffffe
	opLegacyBounce = 0xffffffff
)

func mapRoot(t *testing.T, tx tracetest.Tx) *tracetracking.ReceivedMessage {
	t.Helper()
	root, err := tracetracking.MapToReceivedMessage(tx.Transaction)
	require.NoError(t, err)
	return &root
}

// execution records transmitter -> OffRamp -> Router -> receiver, with the Router also returning
// excess to the OffRamp, and returns the trace root and the Router's delivery to the receiver.
func execution(t *testing.T, chain *tracetest.Chain) (*tracetracking.ReceivedMessage, *tlb.InternalMessage) {
	t.Helper()

	execute := chain.Send(transmitter, offRampAddr, tracetest.Body(opExecute))
	offRampTx := chain.Receive(execute, tracetest.Out{Dst: routerAddr, Body: tracetest.Body(opRoute)})
	routerTx := chain.Receive(offRampTx.Out[0],
		tracetest.Out{Dst: receiver, Body: tracetest.Body(offramp.OpcodeCCIPReceive)},
		tracetest.Out{Dst: offRampAddr, Body: tracetest.Body(opExcess)},
	)
	delivery, excess := routerTx.Out[0], routerTx.Out[1]
	chain.Receive(excess)

	return mapRoot(t, offRampTx), delivery
}

// confirmLeg records the Router relaying a message from the receiver to the OffRamp, which notifies
// the executor.
func confirmLeg(chain *tracetest.Chain, fromReceiver *tlb.InternalMessage) {
	routerTx := chain.Receive(fromReceiver, tracetest.Out{Dst: offRampAddr, Body: tracetest.Body(opToOffRamp)})
	offRampTx := chain.Receive(routerTx.Out[0], tracetest.Out{Dst: executor, Body: tracetest.Body(opToExecutor)})
	chain.Receive(offRampTx.Out[0])
}

func waitCtx(t *testing.T) context.Context {
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	t.Cleanup(cancel)
	return ctx
}

func TestCCIPReceiverFollowCondition_BoundsMaliciousReceiver(t *testing.T) {
	chain := tracetest.NewChain(t)
	root, delivery := execution(t, chain)

	// The receiver confirms, starts a ping-pong with its own contract, and sends the Router an
	// unknown opcode that the Router bounces back to it. Neither the ping-pong nor the bounce is ever
	// received, so the trace only completes if both are skipped.
	receiverTx := chain.Receive(delivery,
		tracetest.Out{Dst: routerAddr, Body: tracetest.Body(router.OpcodeCCIPReceiveConfirm)},
		tracetest.Out{Dst: attacker, Body: tracetest.Body(opUnknown)},
		tracetest.Out{Dst: routerAddr, Body: tracetest.Body(opUnknown)},
	)
	confirm, unknown := receiverTx.Out[0], receiverTx.Out[2]
	confirmLeg(chain, confirm)
	chain.ReceiveWithExitCode(0xffff, unknown,
		tracetest.Out{Dst: receiver, Body: tracetest.Body(opLegacyBounce), Bounced: true},
	)

	require.NoError(t, root.WaitForTraceWith(waitCtx(t), chain, bindings.CCIPReceiverFollowCondition))

	receiverMsg := root.OutgoingInternalReceivedMessages[0].OutgoingInternalReceivedMessages[0]
	require.True(t, receiverMsg.InternalMsg.DstAddr.Equals(receiver))

	// Only the receiver's messages back to the Router are followed.
	require.Len(t, receiverMsg.OutgoingInternalReceivedMessages, 2)
	require.Len(t, receiverMsg.OutgoingInternalSkippedMessages, 1)
	require.True(t, receiverMsg.OutgoingInternalSkippedMessages[0].InternalMsg.DstAddr.Equals(attacker))

	// The confirmation is followed to the executor.
	confirmMsg := receiverMsg.OutgoingInternalReceivedMessages[0]
	require.Len(t, confirmMsg.OutgoingInternalReceivedMessages, 1)
	require.Len(t, confirmMsg.OutgoingInternalReceivedMessages[0].OutgoingInternalReceivedMessages, 1)

	// The Router's reply to the receiver is skipped.
	unknownMsg := receiverMsg.OutgoingInternalReceivedMessages[1]
	require.Empty(t, unknownMsg.OutgoingInternalReceivedMessages)
	require.Len(t, unknownMsg.OutgoingInternalSkippedMessages, 1)
	require.True(t, unknownMsg.OutgoingInternalSkippedMessages[0].InternalMsg.DstAddr.Equals(receiver))

	require.NotContains(t, chain.Subscribed(), attacker.String())
}

// receiverBounces records the receiver failing on delivery and its bounce going through the Router
// to the executor.
func receiverBounces(chain *tracetest.Chain, delivery *tlb.InternalMessage) {
	receiverTx := chain.ReceiveWithExitCode(100, delivery,
		tracetest.Out{Dst: routerAddr, Body: tracetest.Body(opRichBounce), Bounced: true},
	)
	confirmLeg(chain, receiverTx.Out[0])
}

func TestCCIPReceiverFollowCondition_FollowsReceiverBounce(t *testing.T) {
	chain := tracetest.NewChain(t)
	root, delivery := execution(t, chain)
	receiverBounces(chain, delivery)

	require.NoError(t, root.WaitForTraceWith(waitCtx(t), chain, bindings.CCIPReceiverFollowCondition))

	receiverMsg := root.OutgoingInternalReceivedMessages[0].OutgoingInternalReceivedMessages[0]
	require.Len(t, receiverMsg.OutgoingInternalReceivedMessages, 1)
	require.Empty(t, receiverMsg.OutgoingInternalSkippedMessages)
	bounceMsg := receiverMsg.OutgoingInternalReceivedMessages[0]
	require.Len(t, bounceMsg.OutgoingInternalReceivedMessages, 1)
}

func TestCCIPReceiverFollowCondition_FollowsTracesWithoutDelivery(t *testing.T) {
	chain := tracetest.NewChain(t)
	execute := chain.Send(transmitter, offRampAddr, tracetest.Body(opExecute))
	rootTx := chain.Receive(execute, tracetest.Out{Dst: attacker, Body: tracetest.Body(opUnknown)})
	chain.Receive(rootTx.Out[0])

	root := mapRoot(t, rootTx)
	require.NoError(t, root.WaitForTraceWith(waitCtx(t), chain, bindings.CCIPReceiverFollowCondition))
	require.Len(t, root.OutgoingInternalReceivedMessages, 1)
	require.Empty(t, root.OutgoingInternalSkippedMessages)
}

func TestCCIPReceiverOutcomeBoundary(t *testing.T) {
	t.Run("receiver failure does not fail the trace", func(t *testing.T) {
		chain := tracetest.NewChain(t)
		root, delivery := execution(t, chain)
		receiverBounces(chain, delivery)
		require.NoError(t, root.WaitForTraceWith(waitCtx(t), chain, bindings.CCIPReceiverFollowCondition))

		exitCode, err := root.TraceExitCodeWith(bindings.CCIPReceiverOutcomeBoundary)
		require.NoError(t, err)
		require.Equal(t, tvm.ExitCodeSuccess, exitCode)
		succeeded, err := root.TraceSucceededWith(bindings.CCIPReceiverOutcomeBoundary)
		require.NoError(t, err)
		require.True(t, succeeded)

		// Without the boundary, the receiver's failure is the trace's outcome.
		exitCode, err = root.TraceExitCode()
		require.NoError(t, err)
		require.Equal(t, tvm.ExitCode(100), exitCode)
	})

	t.Run("failures before the receiver fail the trace", func(t *testing.T) {
		chain := tracetest.NewChain(t)
		execute := chain.Send(transmitter, offRampAddr, tracetest.Body(opExecute))
		rootTx := chain.Receive(execute, tracetest.Out{Dst: routerAddr, Body: tracetest.Body(opRoute)})
		chain.ReceiveWithExitCode(200, rootTx.Out[0])

		root := mapRoot(t, rootTx)
		require.NoError(t, root.WaitForTraceWith(waitCtx(t), chain, bindings.CCIPReceiverFollowCondition))

		exitCode, err := root.TraceExitCodeWith(bindings.CCIPReceiverOutcomeBoundary)
		require.NoError(t, err)
		require.Equal(t, tvm.ExitCode(200), exitCode)
		succeeded, err := root.TraceSucceededWith(bindings.CCIPReceiverOutcomeBoundary)
		require.NoError(t, err)
		require.False(t, succeeded)
	})
}

package bindings_test

import (
	"context"
	"math/big"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

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

// execID is the execution the Router delivers in execution, and otherExecID another one.
var (
	execID      = big.NewInt(0xe1)
	otherExecID = big.NewInt(0xe2)
)

// deliveryBody returns a Receiver_CCIPReceiveV2 body for execution id, up to the execution ID.
func deliveryBody(id *big.Int) *cell.Cell {
	return cell.BeginCell().
		MustStoreUInt(offramp.OpcodeCCIPReceive, 32).
		MustStoreBigUInt(id, 192).
		EndCell()
}

// confirmBody returns a Router_CCIPReceiveConfirm body for execution id.
func confirmBody(t *testing.T, id *big.Int) *cell.Cell {
	t.Helper()
	body, err := tlb.ToCell(router.CCIPReceiveConfirm{QueryID: 1, ExecID: id})
	require.NoError(t, err)
	return body
}

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
		tracetest.Out{Dst: receiver, Body: deliveryBody(execID)},
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

	// The receiver confirms, starts a ping-pong with its own contract, sends the Router an unknown
	// opcode that the Router bounces back to it, has the Router start a send that reaches the
	// attacker, and confirms again. None of the ping-pong, the bounce, the send or the second
	// confirmation ever completes, so the trace only completes if all of them are skipped.
	receiverTx := chain.Receive(delivery,
		tracetest.Out{Dst: routerAddr, Body: confirmBody(t, execID)},
		tracetest.Out{Dst: attacker, Body: tracetest.Body(opUnknown)},
		tracetest.Out{Dst: routerAddr, Body: tracetest.Body(opUnknown)},
		tracetest.Out{Dst: routerAddr, Body: tracetest.Body(router.OpcodeCCIPSend)},
		tracetest.Out{Dst: routerAddr, Body: confirmBody(t, execID)},
	)
	confirm, unknown, send, again := receiverTx.Out[0], receiverTx.Out[2], receiverTx.Out[3], receiverTx.Out[4]
	confirmLeg(chain, confirm)
	chain.ReceiveWithExitCode(0xffff, unknown,
		tracetest.Out{Dst: receiver, Body: tracetest.Body(opLegacyBounce), Bounced: true},
	)
	chain.Receive(send, tracetest.Out{Dst: attacker, Body: tracetest.Body(opUnknown)})

	require.NoError(t, root.WaitForTraceWith(waitCtx(t), chain, bindings.CCIPReceiverFollowCondition))

	receiverMsg := root.OutgoingInternalReceivedMessages[0].OutgoingInternalReceivedMessages[0]
	require.True(t, receiverMsg.InternalMsg.DstAddr.Equals(receiver))

	// Only the confirmation is followed, to the executor.
	require.Len(t, receiverMsg.OutgoingInternalReceivedMessages, 1)
	confirmMsg := receiverMsg.OutgoingInternalReceivedMessages[0]
	require.True(t, confirmMsg.InternalMsg.DstAddr.Equals(routerAddr))
	require.Len(t, confirmMsg.OutgoingInternalReceivedMessages, 1)
	require.Len(t, confirmMsg.OutgoingInternalReceivedMessages[0].OutgoingInternalReceivedMessages, 1)

	skipped := receiverMsg.OutgoingInternalSkippedMessages
	require.Len(t, skipped, 4)
	require.True(t, skipped[0].InternalMsg.DstAddr.Equals(attacker))
	require.Equal(t, unknown.CreatedLT, skipped[1].InternalMsg.CreatedLT)
	require.Equal(t, send.CreatedLT, skipped[2].InternalMsg.CreatedLT)
	require.Equal(t, again.CreatedLT, skipped[3].InternalMsg.CreatedLT)

	require.NotContains(t, chain.Searched(), attacker.String())
}

func TestCCIPReceiverFollowCondition_SkipsRepliesToReceiver(t *testing.T) {
	chain := tracetest.NewChain(t)
	root, delivery := execution(t, chain)

	// The OffRamp rejects the confirmation and the Router tells the receiver, which never handles it.
	receiverTx := chain.Receive(delivery,
		tracetest.Out{Dst: routerAddr, Body: confirmBody(t, execID)},
	)
	routerTx := chain.Receive(receiverTx.Out[0], tracetest.Out{Dst: offRampAddr, Body: tracetest.Body(opToOffRamp)})
	offRampTx := chain.ReceiveWithExitCode(300, routerTx.Out[0],
		tracetest.Out{Dst: routerAddr, Body: tracetest.Body(opRichBounce), Bounced: true},
	)
	chain.Receive(offRampTx.Out[0], tracetest.Out{Dst: receiver, Body: tracetest.Body(opUnknown)})

	require.NoError(t, root.WaitForTraceWith(waitCtx(t), chain, bindings.CCIPReceiverFollowCondition))

	confirmMsg := root.OutgoingInternalReceivedMessages[0].OutgoingInternalReceivedMessages[0].OutgoingInternalReceivedMessages[0]
	bouncedMsg := confirmMsg.OutgoingInternalReceivedMessages[0].OutgoingInternalReceivedMessages[0]
	require.True(t, bouncedMsg.InternalMsg.Bounced)
	require.Empty(t, bouncedMsg.OutgoingInternalReceivedMessages)
	require.Len(t, bouncedMsg.OutgoingInternalSkippedMessages, 1)
	require.True(t, bouncedMsg.OutgoingInternalSkippedMessages[0].InternalMsg.DstAddr.Equals(receiver))
}

func TestCCIPReceiverFollowCondition_FollowsFirstConfirmationOfExecution(t *testing.T) {
	chain := tracetest.NewChain(t)
	root, delivery := execution(t, chain)

	// Before confirming the delivered execution, the receiver confirms another execution and sends a
	// truncated confirmation. Only the confirmation of the delivered execution is ever received.
	receiverTx := chain.Receive(delivery,
		tracetest.Out{Dst: routerAddr, Body: confirmBody(t, otherExecID)},
		tracetest.Out{Dst: routerAddr, Body: tracetest.Body(router.OpcodeCCIPReceiveConfirm)},
		tracetest.Out{Dst: routerAddr, Body: confirmBody(t, execID)},
	)
	confirmLeg(chain, receiverTx.Out[2])

	require.NoError(t, root.WaitForTraceWith(waitCtx(t), chain, bindings.CCIPReceiverFollowCondition))

	receiverMsg := root.OutgoingInternalReceivedMessages[0].OutgoingInternalReceivedMessages[0]
	require.Len(t, receiverMsg.OutgoingInternalReceivedMessages, 1)
	require.Equal(t, receiverTx.Out[2].CreatedLT, receiverMsg.OutgoingInternalReceivedMessages[0].InternalMsg.CreatedLT)
	require.Len(t, receiverMsg.OutgoingInternalSkippedMessages, 2)
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

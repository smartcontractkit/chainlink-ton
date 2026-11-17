package bindings

import (
	"bytes"
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

// DefaultTraceStopCondition is the default policy for bounded trace tracking - stopping message (DAG)
// trace tracking in the context of MCMS/CCIP.
//
// Notice: we expect account contracts (e.g., Wallet contracts, MCMS/Timelock, multisigs, etc) to accept
// all incoming messages (replies) and not reject with 0xffff (wrong opcode) but accept/ignore.
var DefaultTraceStopCondition tracetracking.StopCondition = func(parent, current *tracetracking.ReceivedMessage) (bool, error) {
	// Check if internal messages exist, or continue
	if current.InternalMsg == nil {
		return false, nil
	}

	ec, err := current.ExitCode()
	if err != nil {
		return false, fmt.Errorf("failed to get exit code: %w", err)
	}

	// Check specific conditions and opcodes for MCMS/CCIP messages to determine trace boundaries
	opcodeCurrent, err := tvm.ExtractOpcode(current.InternalMsg.Body)
	if err != nil {
		return false, fmt.Errorf("failed to extract opcode from current message: %w", err)
	}

	// Stop tracing on NoState exit code (fwd notifications to uninitialized accounts)
	if ec == tvm.ExitCodeComputeSkipReasonNoState {
		fmt.Printf("Stopping trace tracking due to NoState exit code on opcode %d\n", opcodeCurrent)
		switch uint64(opcodeCurrent) {
		case 0:
			return true, nil // allow empty messages to uninitialized accounts (stop tracing)
		case rbac.OpcodeRoleGranted:
			return true, nil // allow ac forward notifications to uninitialized accounts (stop tracing)
		case rbac.OpcodeRoleRevoked:
			return true, nil // allow ac forward notifications to uninitialized accounts (stop tracing)
		}
	}

	if parent.InternalMsg == nil {
		return false, nil
	}

	opcodeParent, err := tvm.ExtractOpcode(parent.InternalMsg.Body)
	if err != nil {
		return false, fmt.Errorf("failed to extract opcode from parent message: %w", err)
	}

	switch uint64(opcodeParent) {
	// Trace the Receiver_CCIPReceiveV2 flow, exclude the receiver downstream messages
	case offramp.OpcodeCCIPReceive:
		// Stop tracing if the current message is not router.CCIPReceiveConfirm (i.e. don't consider
		// any other outgoing msgs/notifications from third-party CCIP receiver contracts - on offramp.Receiver_CCIPReceiveV2)
		return uint64(opcodeCurrent) != router.OpcodeCCIPReceiveConfirm, nil
	}

	return false, nil // Don't stop by default (continue tracing)
}

// CCIPReceiverFollowCondition bounds the trace a transaction waits for at the third-party CCIP
// receiver. Of the messages the receiver sends while handling the Router's Receiver_CCIPReceiveV2
// delivery, it follows only the one that reports the outcome back to the Router that delivered: the
// bounce of the delivery, or the earliest Router_CCIPReceiveConfirm for the delivery's execution.
// Downstream of it, it follows the Router, OffRamp and ReceiveExecutor handling it, and skips every
// message addressed back to the receiver.
//
// Without this, a receiver could keep the trace open indefinitely, by messaging its own contracts,
// by answering the Router's replies to it, or by having the Router start unrelated flows on its
// behalf (such as a Router_CCIPSend), and could grow it with further confirmations.
//
// Traces without a Receiver_CCIPReceiveV2 delivery are followed entirely.
var CCIPReceiverFollowCondition tracetracking.FollowCondition = func(path []*tracetracking.ReceivedMessage, out *tracetracking.SentMessage) (bool, error) {
	for i, msg := range path {
		isDelivery, err := isCCIPReceiveDelivery(msg)
		if err != nil {
			return false, err
		}
		if !isDelivery {
			continue
		}

		if i == len(path)-1 {
			// out is sent by the receiver.
			return isCCIPReceiveOutcome(msg, out)
		}
		// out is sent while the outcome is relayed to the OffRamp: keep out of the receiver.
		return !out.InternalMsg.DstAddr.Equals(msg.InternalMsg.DstAddr), nil
	}
	return true, nil
}

// isCCIPReceiveOutcome reports whether out, sent by the receiver handling delivery, reports the
// outcome of delivery to the Router that sent it: the bounce of delivery, or the earliest
// Router_CCIPReceiveConfirm for delivery's execution.
//
// Messages from one account to another are delivered in the order they were created, so the
// earliest confirmation is the first to reach the execution's ReceiveExecutor. It ends the
// execution, and the ReceiveExecutor rejects any later one. Confirmations for other executions
// don't end delivery's.
func isCCIPReceiveOutcome(delivery *tracetracking.ReceivedMessage, out *tracetracking.SentMessage) (bool, error) {
	routerAddr := delivery.InternalMsg.SrcAddr
	if !out.InternalMsg.DstAddr.Equals(routerAddr) {
		return false, nil
	}
	if out.InternalMsg.Bounced {
		return true, nil
	}

	execID, err := ccipReceiveExecID(delivery.InternalMsg.Body)
	if err != nil {
		return false, fmt.Errorf("failed to read the execution ID of the delivery: %w", err)
	}
	if !confirmsExecution(out.InternalMsg.Body, execID) {
		return false, nil
	}
	for _, sibling := range outgoingInternalMessages(delivery) {
		if sibling.CreatedLT < out.InternalMsg.CreatedLT && sibling.DstAddr.Equals(routerAddr) && confirmsExecution(sibling.Body, execID) {
			return false, nil // an earlier confirmation ends the execution
		}
	}
	return true, nil
}

// ccipReceiveExecID returns the execution ID of a Receiver_CCIPReceiveV2 body.
func ccipReceiveExecID(body *cell.Cell) ([]byte, error) {
	s, err := body.BeginParse()
	if err != nil {
		return nil, err
	}
	if _, err = s.LoadUInt(32); err != nil { // opcode
		return nil, err
	}
	return s.LoadSlice(ccipExecIDBits)
}

// confirmsExecution reports whether body is a Router_CCIPReceiveConfirm for execution execID. The
// body comes from the receiver, so a malformed one is not a confirmation rather than an error.
func confirmsExecution(body *cell.Cell, execID []byte) bool {
	if body == nil {
		return false
	}
	s, err := body.BeginParse()
	if err != nil {
		return false
	}
	opcode, err := s.LoadUInt(32)
	if err != nil || opcode != router.OpcodeCCIPReceiveConfirm {
		return false
	}
	if _, err = s.LoadUInt(64); err != nil { // query ID
		return false
	}
	confirmed, err := s.LoadSlice(ccipExecIDBits)
	return err == nil && bytes.Equal(confirmed, execID)
}

// ccipExecIDBits is the size of a CCIP execution ID.
const ccipExecIDBits = 192

// outgoingInternalMessages returns the internal messages msg sent, whether pending, received or
// skipped.
func outgoingInternalMessages(msg *tracetracking.ReceivedMessage) []*tlb.InternalMessage {
	out := make([]*tlb.InternalMessage, 0, len(msg.OutgoingInternalSentMessages)+len(msg.OutgoingInternalReceivedMessages)+len(msg.OutgoingInternalSkippedMessages))
	for _, sent := range msg.OutgoingInternalSentMessages {
		out = append(out, sent.InternalMsg)
	}
	for _, received := range msg.OutgoingInternalReceivedMessages {
		out = append(out, received.InternalMsg)
	}
	for _, skipped := range msg.OutgoingInternalSkippedMessages {
		out = append(out, skipped.InternalMsg)
	}
	return out
}

// CCIPReceiverOutcomeBoundary excludes the third-party CCIP receiver's handling of a
// Receiver_CCIPReceiveV2 delivery, and everything that follows it, from a trace's outcome. The
// receiver failing or bouncing is a message execution outcome the OffRamp records, not a failure of
// the transaction that triggered the execution.
var CCIPReceiverOutcomeBoundary tracetracking.StopCondition = func(_, current *tracetracking.ReceivedMessage) (bool, error) {
	return isCCIPReceiveDelivery(current)
}

// isCCIPReceiveDelivery reports whether msg is a receiver handling a Receiver_CCIPReceiveV2 delivery.
func isCCIPReceiveDelivery(msg *tracetracking.ReceivedMessage) (bool, error) {
	if msg.InternalMsg == nil || msg.InternalMsg.Bounced {
		return false, nil
	}
	opcode, err := tvm.ExtractOpcode(msg.InternalMsg.Body)
	if err != nil {
		return false, fmt.Errorf("failed to extract opcode: %w", err)
	}
	return uint64(opcode) == offramp.OpcodeCCIPReceive, nil
}

package bindings

import (
	"fmt"

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
// receiver. It follows the Router's Receiver_CCIPReceiveV2 delivery and the receiver's messages
// back to that Router (the confirmation or the bounce), and skips everything else the receiver
// sends as well as every later message addressed to the receiver. Without this, a receiver could
// keep the trace open indefinitely, either messaging its own contracts or answering the Router's
// replies to it.
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

		delivery := msg.InternalMsg
		if i == len(path)-1 {
			// out is sent by the receiver: follow it only back to the Router that delivered.
			return out.InternalMsg.DstAddr.Equals(delivery.SrcAddr), nil
		}
		// out is sent after the receiver handed back to the Router: keep out of the receiver.
		return !out.InternalMsg.DstAddr.Equals(delivery.DstAddr), nil
	}
	return true, nil
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

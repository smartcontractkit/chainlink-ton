package bindings

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"

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
// delivery, it follows only those that report the outcome back to the Router that delivered: a
// Router_CCIPReceiveConfirm or the bounce of the delivery. Downstream of those, it follows the
// Router, OffRamp and ReceiveExecutor handling them, and skips every message addressed back to the
// receiver.
//
// Without this, a receiver could keep the trace open indefinitely, by messaging its own contracts,
// by answering the Router's replies to it, or by having the Router start unrelated flows on its
// behalf (such as a Router_CCIPSend).
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
			// out is sent by the receiver.
			return isCCIPReceiveOutcome(delivery, out)
		}
		// out is sent while the outcome is relayed to the OffRamp: keep out of the receiver.
		return !out.InternalMsg.DstAddr.Equals(delivery.DstAddr), nil
	}
	return true, nil
}

// isCCIPReceiveOutcome reports whether out, sent by the receiver of delivery, reports the outcome of
// delivery to the Router that sent it.
func isCCIPReceiveOutcome(delivery *tlb.InternalMessage, out *tracetracking.SentMessage) (bool, error) {
	if !out.InternalMsg.DstAddr.Equals(delivery.SrcAddr) {
		return false, nil
	}
	if out.InternalMsg.Bounced {
		return true, nil
	}
	opcode, err := tvm.ExtractOpcode(out.InternalMsg.Body)
	if err != nil {
		return false, fmt.Errorf("failed to extract opcode: %w", err)
	}
	return uint64(opcode) == router.OpcodeCCIPReceiveConfirm, nil
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

package bindings

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// DefaultTraceStopCondition is the default policy for bounded trace tracking - stopping message (DAG)
// trace tracking in the context of MCMS/CCIP.
//
// Notice: we expect account contracts (e.g., Wallet contracts, MCMS/Timelock, multisigs, etc) to accept
// all incoming messages (replies) and not reject with 0xffff (wrong opcode) but accept/ignore.
//
//   - we don't track fwd notifications to uninitialized accounts, bounce = false
//   - we don't track outgoing msgs/notifications from third-party CCIP receiver contracts (except for router.CCIPReceiveConfirm)
var DefaultTraceStopCondition tracetracking.StopCondition = func(parent, current *tracetracking.ReceivedMessage) (bool, error) {
	// Check if internal messages exist, or continue (e.g., for external messages)
	if parent.InternalMsg == nil || current.InternalMsg == nil {
		return false, nil
	}

	ec, err := current.ExitCode()
	if err != nil {
		return false, fmt.Errorf("failed to get exit code: %w", err)
	}

	// Stop tracing on NoState exit code (fwd notifications to uninitialized accounts, bounce = false)
	if !current.InternalMsg.Bounce && ec == tvm.ExitCodeComputeSkipReasonNoState {
		return true, nil // stop tracing
	}

	// Check specific opcodes for MCMS/CCIP messages to determine trace boundaries
	opcodeParent, err := tvm.ExtractOpcode(parent.InternalMsg.Body)
	if err != nil {
		return false, fmt.Errorf("failed to extract opcode from parent message: %w", err)
	}

	opcodeCurrent, err := tvm.ExtractOpcode(current.InternalMsg.Body)
	if err != nil {
		return false, fmt.Errorf("failed to extract opcode from current message: %w", err)
	}

	switch uint64(opcodeParent) {
	case offramp.OpcodeCCIPReceive:
		// Stop tracing if the current message is not router.CCIPReceiveConfirm (i.e. don't consider
		// any other outgoing msgs/notifications from third-party CCIP receiver contracts - on offramp.CCIPReceive)
		return uint64(opcodeCurrent) != router.OpcodeCCIPReceiveConfirm, nil
	}

	return false, nil // Don't stop by default (continue tracing)
}

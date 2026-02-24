package tracetracking

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// WaitForTrace waits for the trace of a given transaction and checks if the trace succeeded, stopping the trace
// check when the provided boundary condition is met. If no boundary condition is provided, it checks the entire trace.
func WaitForTrace(ctx context.Context, c ton.APIClientWrapped, tx *tlb.Transaction, boundary ...StopCondition) error {
	r, err := MapToReceivedMessage(tx)
	if err != nil {
		return fmt.Errorf("failed to map tx to ReceivedMessage: %w", err)
	}

	err = r.WaitForTrace(ctx, c)
	if err != nil {
		return fmt.Errorf("failed to wait for trace: %w", err)
	}

	boundaryFunc := NoBound // default to no boundary (check entire trace)
	if len(boundary) > 0 && boundary[0] != nil {
		boundaryFunc = boundary[0]
	}

	ec, err := r.TraceExitCodeWith(boundaryFunc)
	if err != nil {
		return fmt.Errorf("failed to get outcome exit code: %w", err)
	}
	if ec != tvm.ExitCodeSuccess {
		return fmt.Errorf("transaction failed with exit code: %d", ec)
	}

	return nil
}

package tracetracking

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// WaitForTrace waits for the trace of a given transaction.
func WaitForTrace(ctx context.Context, c ton.APIClientWrapped, tx *tlb.Transaction) error {
	r, err := MapToReceivedMessage(tx)
	if err != nil {
		return fmt.Errorf("failed to map tx to ReceivedMessage: %w", err)
	}
	err = r.WaitForTrace(ctx, c)
	if err != nil {
		return fmt.Errorf("failed to wait for trace: %w", err)
	}

	ec := r.OutcomeExitCode()
	if ec != tvm.ExitCodeSuccess {
		return fmt.Errorf("transaction failed with exit code: %d", ec)
	}

	return nil
}

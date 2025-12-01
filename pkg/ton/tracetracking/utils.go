package tracetracking

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
)

// WaitForTrace waits for the trace of a given transaction.
func WaitForTrace(ctx context.Context, c ton.APIClientWrapped, tx *tlb.Transaction) error {
	r, err := MapToReceivedMessage(tx)
	if err != nil {
		return fmt.Errorf("failed to get outgoing messages: %w", err)
	}
	err = r.WaitForTrace(ctx, c)
	if err != nil {
		return fmt.Errorf("failed to wait for trace: %w", err)
	}

	return nil
}

package utils //nolint:revive,nolintlint // TODO: update to meaningful package name

import (
	"context"
	"fmt"

	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
)

type contextKey string

const (
	SeriesIDKey contextKey = "cldf/seriesID"
)

// ExecuteOperation is a helper function to execute an operation whose report is unique by seriesID.
// It sets the seriesID in the context for the duration of the operation execution, so that it can be
// sourced and used by underlying operations. It uses ExecuteOperationN with n=1 to execute a single
// operation and retrieve its report.
func ExecuteOperation[IN, OUT, DEP any](
	b cldfops.Bundle,
	operation *cldfops.Operation[IN, OUT, DEP],
	deps DEP,
	input IN,
	seriesID string,
	opts ...cldfops.ExecuteOption[IN, DEP],
) (cldfops.Report[IN, OUT], error) {
	// Set seriesID in context for the duration of the operation execution,
	// so that it can be sourced and used by underlying operations.
	ctx := b.GetContext()
	b.GetContext = func() context.Context {
		return context.WithValue(ctx, SeriesIDKey, seriesID)
	}

	// Notice: we use the ExecuteOperationN as it has support for matching reports by seriesID,
	// which allows us to define unique executions for sets of operations with same input.
	//
	// Without using a seriesID, if there are multiple operations with same input, the CLDF framework
	// would match the report to the first execution and skip executing the rest of ops with same input.
	n := uint(1) // Execute a single operation
	rr, err := cldfops.ExecuteOperationN(b, operation, deps, input, seriesID, n, opts...)
	if err != nil {
		return cldfops.Report[IN, OUT]{}, fmt.Errorf("failed to execute operation %s: %w", operation.ID(), err)
	}

	if len(rr) != int(n) {
		return cldfops.Report[IN, OUT]{}, fmt.Errorf("expected %d reports, got %d", n, len(rr))
	}

	return rr[0], nil
}

// GetSeriesID retrieves the series ID from the context, if it exists.
func GetSeriesID(ctx context.Context) (string, bool) {
	seriesID, ok := ctx.Value(SeriesIDKey).(string)
	return seriesID, ok
}

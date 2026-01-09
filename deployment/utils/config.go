package utils

import (
	"context"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops"
)

// RegisterTONCodecInEnv registers the TON operations bundle in the given deployment environment.
func RegisterTONCodecInEnv(ctx func() context.Context, lggr logger.Logger, env *cldf.Environment) {
	bundleOpts := []operations.BundleOption{
		operations.WithOperationRegistry(ops.Registry),
	}
	rptr := operations.NewMemoryReporter()
	bundle := operations.NewBundle(ctx, lggr, rptr, bundleOpts...)
	env.OperationsBundle = bundle
}

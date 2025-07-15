package ops

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton/provider"
	cld_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops"
)

type opsEnv struct {
	bundle cld_ops.Bundle
	deps   ops.TonDeps
}

func setupEnv(t *testing.T) opsEnv {
	bundle := cld_ops.NewBundle(
		context.Background,
		logger.Test(t),
		cld_ops.NewMemoryReporter(),
	)

	localTonSelector, err := chainsel.GetChainDetailsByChainIDAndFamily("-217", chainsel.FamilyTon)
	require.NoError(t, err, "failed to get local Ton chain selector")

	p := provider.NewCTFChainProvider(t, localTonSelector.ChainSelector, provider.CTFChainProviderConfig{
		Once: &sync.Once{},
	})

	b, err := p.Initialize(t.Context())
	require.NoError(t, err, "failed to initialize provider")

	time.Sleep(20 * time.Second) // Wait for node client connection to be ready

	gotChain, ok := b.(ton.Chain)
	require.True(t, ok, "expected provider to be of type ton.Chain")

	deps := ops.TonDeps{
		TonChain: gotChain,
	}

	return opsEnv{
		bundle: bundle,
		deps:   deps,
	}
}

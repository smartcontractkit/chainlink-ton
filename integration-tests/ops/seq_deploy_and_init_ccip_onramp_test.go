package ops

import (
	"context"
	"sync"
	"testing"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton/provider"
	cld_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip_onramp"
	"github.com/stretchr/testify/require"
)

func TestDeployAndInitCCIPOnrampOp(t *testing.T) {
	t.Parallel()

	bundle, deps := setupEnv(t)
	_, err := cld_ops.ExecuteOperation(bundle, ccip_onramp.DeployOnRampOp, deps, ops.OpTxInput[ccip_onramp.DeployCCIPOnrampInput]{})
	require.NoError(t, err, "failed to deploy Onramp CCIP Package with DeployOnRampOp")
}

func TestDeployAndInitCCIPOnrampSequence(t *testing.T) {
	t.Parallel()
	bundle, deps := setupEnv(t)
	_, err := cld_ops.ExecuteSequence(bundle, ccip_onramp.DeployAndInitCCIPOnRampSequence, deps, ops.OpTxInput[ccip_onramp.DeployCCIPOnrampInput]{})
	require.NoError(t, err, "failed to deploy Onramp CCIP Package with DeployAndInitCCIPOnRampSequence")
}

func setupEnv(t *testing.T) (cld_ops.Bundle, ops.TonDeps) {
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
	gotChain, ok := b.(ton.Chain)
	require.True(t, ok, "expected provider to be of type ton.Chain")

	deps := ops.TonDeps{
		TonChain: gotChain,
	}

	return bundle, deps
}

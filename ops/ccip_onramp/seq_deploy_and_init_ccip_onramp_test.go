package ccip_onramp

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
	"github.com/stretchr/testify/require"
)

func TestDeployAndInitCCIPOnrampOp(t *testing.T) {
	t.Parallel()
	reporter := cld_ops.NewMemoryReporter()
	bundle := cld_ops.NewBundle(
		context.Background,
		logger.Test(t),
		reporter,
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

	_, err = cld_ops.ExecuteOperation(bundle, DeployOnRampOp, deps, ops.OpTxInput[DeployCCIPOnrampInput]{})
	require.NoError(t, err, "failed to deploy Onramp CCIP Package")
}

//func TestDeployAndInitCCIPOnrampSequence(t *testing.T) {
//	t.Parallel()
//	ccipSeqReport, err := cld_ops.ExecuteSequence(env.OperationsBundle, DeployAndInitCCIPOnRampSequence, deps, ccipSeqInput)
//	if err != nil {
//		return cldf.ChangesetOutput{}, fmt.Errorf("failed to deploy CCIP for Aptos chain %d: %w", chainSel, err)
//	}
//}

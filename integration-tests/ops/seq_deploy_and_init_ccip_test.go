package ops

import (
	"testing"

	cld_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip_onramp"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip_router"
	"github.com/stretchr/testify/require"
)

func TestDeployAndInitCCIPOnrampSequence(t *testing.T) {
	t.Parallel()
	env := setupEnv(t)
	_, err := cld_ops.ExecuteSequence(env.bundle, ccip_onramp.DeployAndInitCCIPOnRampSequence, env.deps, ops.OpTxInput[ccip_onramp.DeployCCIPOnrampInput]{})
	require.NoError(t, err, "failed to deploy Onramp CCIP Package with DeployAndInitCCIPOnRampSequence")
}
func TestDeployAndInitCCIPRouterSequence(t *testing.T) {
	t.Parallel()
	env := setupEnv(t)
	_, err := cld_ops.ExecuteSequence(env.bundle, ccip_router.DeployAndInitCCIPRouterSequence, env.deps, ops.OpTxInput[ccip_router.DeployCCIPRouterInput]{})
	require.NoError(t, err, "failed to deploy Router CCIP Package with DeployAndInitCCIPOnRampSequence")
}

package ops

import (
	"testing"

	"github.com/stretchr/testify/require"

	cld_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip_onramp"
)

func TestDeployAndInitCCIPOnrampOp(t *testing.T) {
	t.Parallel()

	env := setupEnv(t)
	_, err := cld_ops.ExecuteOperation(env.bundle, ccip_onramp.DeployOnRampOp, env.deps, ops.OpTxInput[ccip_onramp.DeployCCIPOnrampInput]{})
	require.NoError(t, err, "failed to deploy Onramp CCIP Package with DeployOnRampOp")
}

func TestDeployAndInitCCIPOnrampSequence(t *testing.T) {
	t.Parallel()
	env := setupEnv(t)
	_, err := cld_ops.ExecuteSequence(env.bundle, ccip_onramp.DeployAndInitCCIPOnRampSequence, env.deps, ops.OpTxInput[ccip_onramp.DeployCCIPOnrampInput]{})
	require.NoError(t, err, "failed to deploy Onramp CCIP Package with DeployAndInitCCIPOnRampSequence")
}

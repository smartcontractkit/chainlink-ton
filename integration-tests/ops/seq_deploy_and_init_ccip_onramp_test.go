package ops

import (
	"testing"

	cld_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip_onramp"
	"github.com/stretchr/testify/require"
)

func TestDeployAndInitCCIPOnrampSequence(t *testing.T) {
	t.Parallel()
	env := setupEnv(t)
	_, err := cld_ops.ExecuteSequence(env.bundle, ccip_onramp.DeployAndInitCCIPOnRampSequence, env.deps, ops.OpTxInput[ccip_onramp.DeployCCIPOnrampInput]{})
	require.NoError(t, err, "failed to deploy Onramp CCIP Package with DeployAndInitCCIPOnRampSequence")
}

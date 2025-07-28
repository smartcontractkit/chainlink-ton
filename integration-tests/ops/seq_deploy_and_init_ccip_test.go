package ops

import (
	"testing"

	cld_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/sequence"
	"github.com/stretchr/testify/require"
)

func TestDeployAndInitCCIPOnrampSequence(t *testing.T) {
	t.Parallel()
	env := setupEnv(t)
	_, err := cld_ops.ExecuteSequence(env.bundle, sequence.DeployCCIPSequence, env.deps, sequence.DeployCCIPSeqInput{})
	require.NoError(t, err, "failed to deploy Onramp CCIP Package with DeployAndInitCCIPOnRampSequence")
}

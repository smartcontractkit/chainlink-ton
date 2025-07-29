package ops

import (
	"math/big"
	"testing"

	cld_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/sequence"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
)

func TestDeploy(t *testing.T) {
	t.Parallel()
	env := setupEnv(t)
	_, err := cld_ops.ExecuteSequence(env.bundle, sequence.DeployCCIPSequence, env.deps, sequence.DeployCCIPSeqInput{
		CCIPConfig: config.ChainContractParams{
			FeeQuoterParams: config.FeeQuoterParams{
				MaxFeeJuelsPerMsg:                    big.NewInt(1),
				TokenPriceStalenessThreshold:         0,
				FeeTokens:                            []*address.Address{},
				PremiumMultiplierWeiPerEthByFeeToken: map[shared.TokenSymbol]uint64{},
			},
			OffRampParams: config.OffRampParams{
				// ...
			},
			OnRampParams: config.OnRampParams{
				ChainSelector: 0,
				// TODO:
				// AllowlistAdmin: &address.Address{},
				FeeAggregator: env.deps.TonChain.WalletAddress,
			},
		},
	})
	require.NoError(t, err, "failed to deploy Onramp CCIP Package with DeployAndInitCCIPOnRampSequence")
}

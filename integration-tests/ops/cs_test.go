package ops

import (
	"math/big"
	"testing"

	cld_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
)

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123

func TestDeploy(t *testing.T) {
	t.Parallel()
	env := setupEnv(t)
	deployReport, err := cld_ops.ExecuteSequence(env.bundle, sequence.DeployCCIPSequence, env.deps, sequence.DeployCCIPSeqInput{
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
				ChainSelector: CHAINSEL_EVM_TEST_90000001,
				// TODO:
				// AllowlistAdmin: &address.Address{},
				FeeAggregator: env.deps.TonChain.WalletAddress,
			},
		},
	})
	require.NoError(t, err, "failed to deploy ccip")

	_, err = cld_ops.ExecuteSequence(env.bundle, sequence.UpdateTonLanesSequence, env.deps, sequence.UpdateTonLanesSeqInput{
		UpdateFeeQuoterDestChainConfigs: operation.UpdateFeeQuoterDestChainConfigsInput{
			// minimal valid config
			{
				DestinationChainSelector: CHAINSEL_EVM_TEST_90000001,
				DestChainConfig: feequoter.DestChainConfig{
					IsEnabled:                         true,
					MaxNumberOfTokensPerMsg:           0,
					MaxDataBytes:                      100,
					MaxPerMsgGasLimit:                 100,
					DestGasOverhead:                   0,
					DestGasPerPayloadByteBase:         0,
					DestGasPerPayloadByteHigh:         0,
					DestGasPerPayloadByteThreshold:    0,
					DestDataAvailabilityOverheadGas:   0,
					DestGasPerDataAvailabilityByte:    0,
					DestDataAvailabilityMultiplierBps: 0,
					ChainFamilySelector:               0,
					EnforceOutOfOrder:                 false,
					DefaultTokenFeeUsdCents:           0,
					DefaultTokenDestGasOverhead:       0,
					DefaultTxGasLimit:                 1,
					GasMultiplierWeiPerEth:            0,
					GasPriceStalenessThreshold:        0,
					NetworkFeeUsdCents:                0,
				},
			},
		},
		UpdateOnRampDestChainConfigs: operation.UpdateOnRampDestChainConfigsInput{
			{
				DestinationChainSelector: CHAINSEL_EVM_TEST_90000001,
				Router:                   common.CrossChainAddress(make([]byte, 64)),
				AllowListEnabled:         false,
			},
		},
		UpdateRouterDestConfig: operation.UpdateRouterDestInput{
			DestChainSelector: CHAINSEL_EVM_TEST_90000001,
			OnRamp:            deployReport.Output.OnRampAddress,
		},
	})
	require.NoError(t, err, "failed to add lane")
}

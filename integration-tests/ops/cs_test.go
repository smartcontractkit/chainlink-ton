package ops

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	// cld_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	chain_selectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/config"
	"github.com/test-go/testify/require"

	// "github.com/smartcontractkit/chainlink-ton/ops/ccip/operation"
	// "github.com/smartcontractkit/chainlink-ton/ops/ccip/sequence"
	// "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	"github.com/smartcontractkit/chainlink/deployment/ccip/shared"
	"github.com/smartcontractkit/chainlink/deployment/environment/memory"
	"github.com/smartcontractkit/chainlink/v2/core/logger"

	// "github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"go.uber.org/zap/zapcore"

	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/smartcontractkit/chainlink/deployment/common/proposalutils"
)

const CHAINSEL_EVM_TEST_90000001 = 909606746561742123

func TestDeploy(t *testing.T) {
	t.Parallel()
	// env := setupEnv(t)
	lggr := logger.TestLogger(t)
	env := memory.NewMemoryEnvironment(t, lggr, zapcore.InfoLevel, memory.MemoryEnvironmentConfig{
		TonChains: 1,
	})

	// Get chain selectors
	evmSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyEVM))[0]
	aptosChainSelectors := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyTon))
	require.Len(t, aptosChainSelectors, 1, "Expected exactly 1 Ton chain")
	chainSelector := aptosChainSelectors[0]
	deployer := env.BlockChains.TonChains()[chainSelector].Wallet
	t.Log("Deployer: ", deployer)

	env, _, err := commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ops.DeployCCIPContracts{}, ops.DeployCCIPContractsCfg{
			TonChainSelector: 0,
			Params: config.ChainContractParams{
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
					FeeAggregator: deployer.WalletAddress(),
				},
			},
		}),
	})
	require.NoError(t, err, "failed to deploy ccip")

	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
		commonchangeset.Configure(ops.AddTonLanes{}, config.UpdateTonLanesConfig{
			EVMMCMSConfig: &proposalutils.TimelockConfig{},
			TonMCMSConfig: &proposalutils.TimelockConfig{},
			Lanes: []config.LaneConfig{
				{
					Source: config.TonChainDefinition{
						ConnectionConfig: v1_6.ConnectionConfig{
							RMNVerificationDisabled: true,
							AllowListEnabled:        false,
						},
						Selector:    chainSelector,
						GasPrice:    big.NewInt(1e17),
						TokenPrices: map[*address.Address]*big.Int{}, // TODO: TON price
						FeeQuoterDestChainConfig: feequoter.DestChainConfig{ // minimal valid config
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
						TokenTransferFeeConfigs: map[uint64]feequoter.UpdateTokenTransferFeeConfig{
							// TODO:
						},
					},
					Dest: config.EVMChainDefinition{
						ChainDefinition: v1_6.ChainDefinition{
							Selector:                 evmSelector,
							GasPrice:                 big.NewInt(1e17),
							TokenPrices:              map[common.Address]*big.Int{},
							FeeQuoterDestChainConfig: v1_6.DefaultFeeQuoterDestChainConfig(true),
							ConnectionConfig: v1_6.ConnectionConfig{
								RMNVerificationDisabled: true,
								AllowListEnabled:        false,
							},
						},
						OnRampVersion: []byte{1, 6, 1},
					},
					IsDisabled: false,
				},
			},
			TestRouter: false,
		}),
	})

	// 	UpdateOnRampDestChainConfigs: operation.UpdateOnRampDestChainConfigsInput{
	// 		{
	// 			DestinationChainSelector: CHAINSEL_EVM_TEST_90000001,
	// 			Router:                   common.CrossChainAddress(make([]byte, 64)),
	// 			AllowListEnabled:         false,
	// 		},
	// 	},
	// 	UpdateRouterDestConfig: operation.UpdateRouterDestInput{
	// 		DestChainSelector: CHAINSEL_EVM_TEST_90000001,
	// 		OnRamp:            deployReport.Output.OnRampAddress,
	// 	},
	// })
	require.NoError(t, err, "failed to add lane")
}

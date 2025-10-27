package deployment

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/Masterminds/semver/v3"
	chainselectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	tonops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/sequence"

	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"

	_ "github.com/smartcontractkit/chainlink-ccip/chains/evm/deployment/v1_6_0/sequences"
	deployops "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	cs_core "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"

	_ "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences"
)

func TestAddLanes(t *testing.T) {
	t.Parallel()
	lggr := logger.Test(t)

	env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().WithEVM().Build(t)
	require.NoError(t, err)

	// Get chain selectors
	evmSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chainselectors.FamilyEVM))[0]
	tonChainSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chainselectors.FamilyTon))[0]

	evmChain := env.BlockChains.EVMChains()[evmSelector]
	tonChain := env.BlockChains.TonChains()[tonChainSelector]

	t.Log("EVM deployer: ", evmChain.DeployerKey.From.String())
	t.Log("TON deployer: ", tonChain.Wallet.WalletAddress().String())

	toolingAPIVersion := semver.MustParse("1.6.0")

	// <deploy-ton>
	// Random contract's ID to avoid collision on subsequence runs of the test against the same chain node
	contractID, err := tonops.RandomUint32()
	require.NoError(t, err)
	cs := commonchangeset.Configure(tonops.DeployCCIPContracts{}, tonops.DeployChainContractsConfig(t, env, tonChainSelector, sequence.ContractsLocalVersion, contractID))

	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")
	// </deploy-ton>

	// <deploy-evm>
	mcmsRegistry := cs_core.NewMCMSReaderRegistry()
	dReg := deployops.GetRegistry()

	out, err := deployops.DeployContracts(dReg).Apply(env, deployops.ContractDeploymentConfig{
		MCMS: mcms.Input{},
		Chains: map[uint64]deployops.ContractDeploymentConfigPerChain{
			evmSelector: {
				Version: toolingAPIVersion,
				// FEE QUOTER CONFIG
				MaxFeeJuelsPerMsg:            big.NewInt(0).Mul(big.NewInt(200), big.NewInt(1e18)),
				TokenPriceStalenessThreshold: uint32(24 * 60 * 60),
				LinkPremiumMultiplier:        9e17, // 0.9 ETH
				NativeTokenPremiumMultiplier: 1e18, // 1.0 ETH
				// OFFRAMP CONFIG
				PermissionLessExecutionThresholdSeconds: uint32((20 * time.Minute).Seconds()),
				GasForCallExactCheck:                    uint16(5000),
			},
		},
	})
	require.NoError(t, err, "Failed to apply DeployChainContracts changeset")
	_ = out.DataStore.Merge(env.DataStore)
	env.DataStore = out.DataStore.Seal()

	// Get OnRamp Address from EVM
	evmOnRampAddr := env.DataStore.Addresses().Filter(
		datastore.AddressRefByChainSelector(evmSelector),
		datastore.AddressRefByType("OnRamp"),
	)[0].Address
	// </deploy-evm>

	tonDefinition := lanes.ChainDefinition{
		Selector: tonChain.Selector,
		GasPrice: big.NewInt(1e17),
		TokenPrices: map[string]*big.Int{
			tonops.TonTokenAddr.String(): big.NewInt(99),
		},
		FeeQuoterDestChainConfig: tonops.TonFeeQuoterDestChainCanonicalConfig,
		RMNVerificationEnabled:   false,
		AllowListEnabled:         false,
	}

	evmDefinition := lanes.ChainDefinition{
		Selector: evmSelector,
		GasPrice: big.NewInt(1e17),
		TokenPrices: map[string]*big.Int{
			"0x779877A7B0D9E8603169DdbD7836e478b4624789": big.NewInt(99),
		},
		FeeQuoterDestChainConfig: tonops.EvmFeeQuoterDestChainCanonicalConfig,
		RMNVerificationEnabled:   false,
		AllowListEnabled:         false,
	}

	// TON <> EVM lanes
	lanesRegistry := lanes.GetLaneAdapterRegistry()
	out, err = lanes.ConnectChains(lanesRegistry, mcmsRegistry).Apply(env, lanes.ConnectChainsConfig{
		Lanes: []lanes.LaneConfig{
			{
				Version: toolingAPIVersion,
				ChainA:  tonDefinition,
				ChainB:  evmDefinition,
			},
		},
	})
	require.NoError(t, err, "Failed to apply ConnectChains changeset")

	// Check TON state
	state, err := tonstate.LoadOnchainState(env)
	require.NoError(t, err)

	// addrCodec := codec.NewAddressCodec()
	routerAddr := state[tonChainSelector].Router
	// rawRouterAddr, err := addrCodec.AddressStringToBytes(routerAddr.String())
	require.NoError(t, err)
	onRampAddr := state[tonChainSelector].OnRamp
	// rawOnRampAddr, err := addrCodec.AddressStringToBytes(onRampAddr.String())
	require.NoError(t, err)
	offRampAddr := state[tonChainSelector].OffRamp
	// rawOffRampAddr, err := addrCodec.AddressStringToBytes(offRampAddr.String())
	require.NoError(t, err)
	feeQuoterAddr := state[tonChainSelector].FeeQuoter
	// rawFeeQuoterAddr, err := addrCodec.AddressStringToBytes(feeQuoterAddr.String())
	require.NoError(t, err)

	t.Run("StateView", func(t *testing.T) {
		generatedView, err := state[tonChainSelector].GenerateView(&env, tonChainSelector, "-1")
		require.NoError(t, err)
		require.Equal(t, "-1", generatedView.ChainID)
		require.Equal(t, tonChainSelector, generatedView.ChainSelector)

		// OnRamp
		onRampView, exit := generatedView.OnRamp[onRampAddr.String()]
		require.True(t, exit, "onRamp view not found")
		require.Equal(t, onRampAddr, *onRampView.Address)
		// Check the EVM has been configured as a destination chain
		destChainConfig, ok := onRampView.DestChainConfig[evmSelector]
		require.True(t, ok, "onRamp does not have evm configured as destination chain")
		require.False(t, destChainConfig.AllowListEnabled, "allowlist should be disabled")
		require.Equal(t, routerAddr, *destChainConfig.Router)
		require.Equal(t, uint64(0), destChainConfig.SequenceNumber)

		// Router
		routerView, exit := generatedView.Router[routerAddr.String()]
		require.True(t, exit, "onRamp view not found")
		require.Equal(t, routerAddr, *routerView.Address)
		onRampForEVMChain, ok := routerView.OnRampAddresses[evmSelector]
		require.True(t, ok, "router does not have evm configured as destination chain")
		require.Equal(t, onRampAddr, *onRampForEVMChain)

		// FeeQuoter
		feeQuoterView, exit := generatedView.FeeQuoter[feeQuoterAddr.String()]
		require.True(t, exit, "feeQuoter view not found")
		require.Equal(t, feeQuoterAddr, *feeQuoterView.Address)
		destConfig, exist := feeQuoterView.DestChainConfig[evmSelector]
		require.True(t, exist, "feeQuoter view dest config not found")
		require.True(t, destConfig.IsEnabled)
		require.Equal(t, uint16(10), destConfig.MaxNumberOfTokensPerMsg)
		require.Equal(t, uint32(3000000), destConfig.MaxPerMsgGasLimit)
		// TODO Add token prices to the fee quoter view and assert that those have been applied on chain

		// OffRamp
		offRampView, exit := generatedView.OffRamp[offRampAddr.String()]
		require.True(t, exit, "offRamp view not found")
		require.Equal(t, offRampAddr, *offRampView.Address)
		require.Equal(t, tonChainSelector, offRampView.Config.ChainSelector)
		require.Equal(t, feeQuoterAddr, *offRampView.Config.FeeQuoterAddress)
		require.Equal(t, routerAddr, *offRampView.SourceChainConfigs[evmSelector].Router)
		require.True(t, offRampView.SourceChainConfigs[evmSelector].IsEnabled)
		require.Equal(t, uint64(1), offRampView.SourceChainConfigs[evmSelector].MinSeqNr) // This starts with 1 as it's the minimum expected from the remote chain
		require.True(t, offRampView.SourceChainConfigs[evmSelector].IsRMNVerificationDisabled)
		require.Equal(t, strings.ToLower(evmOnRampAddr), strings.ToLower("0x"+hex.EncodeToString(offRampView.SourceChainConfigs[evmSelector].OnRamp[12:])))

		data, err := json.MarshalIndent(generatedView, "", "  ")
		require.NoError(t, err)
		fmt.Print("JSON encoded TON state view:\n" + string(data))
	})
}

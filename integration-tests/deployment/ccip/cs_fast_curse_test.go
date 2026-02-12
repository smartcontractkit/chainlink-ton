package ccip

import (
	"math/big"
	"testing"
	"time"

	"github.com/Masterminds/semver/v3"
	chainselectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	_ "github.com/smartcontractkit/chainlink-ccip/chains/evm/deployment/v1_6_0/sequences"
	deployops "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/fastcurse"
	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	cs_core "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"

	ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"
	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"
)

func TestFastCurseTON(t *testing.T) {
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

	// <deploy-evm>
	mcmsRegistry := cs_core.GetRegistry()
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
	// </deploy-evm>

	// <deploy-ton>
	// Random contract's ID to avoid collision on subsequence runs of the test against the same chain node
	contractID, err := ops.RandomUint32()
	require.NoError(t, err)

	version := sequence.ContractsVersionLocal
	cs := commonchangeset.Configure(ops.DeployCCIPContracts{}, ops.DeployChainContractsConfig(t, env, tonChainSelector, version, contractID))

	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")
	// </deploy-ton>

	tonDefinition := lanes.ChainDefinition{
		Selector: tonChain.Selector,
		GasPrice: big.NewInt(1e17),
		TokenPrices: map[string]*big.Int{
			tvm.TonTokenAddr.String(): big.NewInt(99),
		},
		FeeQuoterDestChainConfig: ops.TonFeeQuoterDestChainCanonicalConfig,
		RMNVerificationEnabled:   false,
		AllowListEnabled:         false,
	}

	evmDefinition := lanes.ChainDefinition{
		Selector: evmSelector,
		GasPrice: big.NewInt(1e17),
		TokenPrices: map[string]*big.Int{
			"0x779877A7B0D9E8603169DdbD7836e478b4624789": big.NewInt(99),
		},
		FeeQuoterDestChainConfig: ops.EvmFeeQuoterDestChainCanonicalConfig,
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

	routerAddr := state[tonChainSelector].Router
	require.False(t, routerAddr.IsAddrNone(), "router address should be set")

	t.Run("FastCurseAPI", func(t *testing.T) {
		// Create and initialize the TonCurseAdapter for fast curse
		adapter := &sequences.TonCurseAdapter{}

		// Initialize the adapter for TON chain
		err := adapter.Initialize(env, tonChainSelector)
		require.NoError(t, err, "Failed to initialize adapter for TON chain")

		// Test SubjectToSelector and SelectorToSubject conversion
		t.Run("SubjectConversion", func(t *testing.T) {
			// Convert EVM selector to subject
			evmSubject := adapter.SelectorToSubject(evmSelector)
			require.NotNil(t, evmSubject)

			// Convert subject back to selector
			recoveredSelector, err := adapter.SubjectToSelector(evmSubject)
			require.NoError(t, err)
			require.Equal(t, evmSelector, recoveredSelector, "selector should match after round-trip conversion")

			// Test global curse subject
			globalSubject := fastcurse.GlobalCurseSubject()
			globalSelector, err := adapter.SubjectToSelector(globalSubject)
			require.NoError(t, err)
			require.Equal(t, uint64(0), globalSelector, "global curse subject should convert to selector 0")
		})

		// Test IsCurseEnabledForChain
		t.Run("IsCurseEnabledForChain", func(t *testing.T) {
			enabled, err := adapter.IsCurseEnabledForChain(env, tonChainSelector)
			require.NoError(t, err)
			require.True(t, enabled, "curse should be enabled for TON chain")
		})

		// Test IsChainConnectedToTargetChain
		t.Run("ChainConnectivity", func(t *testing.T) {
			connected, err := adapter.IsChainConnectedToTargetChain(env, tonChainSelector, evmSelector)
			require.NoError(t, err)
			require.True(t, connected, "TON chain should be connected to EVM chain")
		})

		// Test ListConnectedChains
		t.Run("ListConnectedChains", func(t *testing.T) {
			connectedChains, err := adapter.ListConnectedChains(env, tonChainSelector)
			require.NoError(t, err)
			require.Contains(t, connectedChains, evmSelector, "connected chains should include EVM selector")
		})

		// Test DeriveCurseAdapterVersion
		t.Run("AdapterVersion", func(t *testing.T) {
			version, err := adapter.DeriveCurseAdapterVersion(env, tonChainSelector)
			require.NoError(t, err)
			require.Equal(t, "1.6.0", version.String(), "adapter version should be 1.6.0")
		})

		// Test IsSubjectCursedOnChain (should not be cursed initially)
		t.Run("InitialCurseState", func(t *testing.T) {
			evmSubject := adapter.SelectorToSubject(evmSelector)
			isCursed, err := adapter.IsSubjectCursedOnChain(env, tonChainSelector, evmSubject)
			require.NoError(t, err)
			require.False(t, isCursed, "EVM subject should not be cursed initially")
		})

		// Test Curse operation using adapter sequence
		t.Run("CurseSubject", func(t *testing.T) {
			evmSubject := adapter.SelectorToSubject(evmSelector)

			// Create curse configuration
			curseCfg := fastcurse.RMNCurseConfig{
				CurseActions: []fastcurse.CurseActionInput{
					{
						IsGlobalCurse:        false,
						ChainSelector:        tonChainSelector,
						SubjectChainSelector: evmSelector,
						Version:              toolingAPIVersion,
					},
				},
				Force: false,
				MCMS:  mcms.Input{},
			}

			// Apply the curse changeset
			reg := fastcurse.GetCurseRegistry()
			_, err := fastcurse.CurseChangeset(reg, mcmsRegistry).Apply(env, curseCfg)
			require.NoError(t, err, "Failed to apply curse changeset")

			// Verify subject is cursed
			isCursed, err := adapter.IsSubjectCursedOnChain(env, tonChainSelector, evmSubject)
			require.NoError(t, err)
			require.True(t, isCursed, "EVM subject should be cursed after curse operation")

			t.Log("Successfully cursed EVM chain subject on TON chain")
		})

		// Test Uncurse operation using adapter sequence
		t.Run("UncurseSubject", func(t *testing.T) {
			evmSubject := adapter.SelectorToSubject(evmSelector)

			// Create uncurse configuration
			uncurseCfg := fastcurse.RMNCurseConfig{
				CurseActions: []fastcurse.CurseActionInput{
					{
						IsGlobalCurse:        false,
						ChainSelector:        tonChainSelector,
						SubjectChainSelector: evmSelector,
						Version:              toolingAPIVersion,
					},
				},
				Force: false,
				MCMS:  mcms.Input{},
			}

			// Apply the uncurse changeset
			reg := fastcurse.GetCurseRegistry()
			_, err := fastcurse.UncurseChangeset(reg, mcmsRegistry).Apply(env, uncurseCfg)
			require.NoError(t, err, "Failed to apply uncurse changeset")

			// Verify subject is no longer cursed
			isCursed, err := adapter.IsSubjectCursedOnChain(env, tonChainSelector, evmSubject)
			require.NoError(t, err)
			require.False(t, isCursed, "EVM subject should not be cursed after uncurse operation")

			t.Log("Successfully uncursed EVM chain subject on TON chain")
		})

		// Test cursing multiple subjects using adapter sequence
		t.Run("CurseMultipleSubjects", func(t *testing.T) {
			// Create subjects for EVM and global curse
			evmSubject := adapter.SelectorToSubject(evmSelector)
			globalSubject := fastcurse.GlobalCurseSubject()

			// Create curse configuration for multiple subjects
			curseCfg := fastcurse.RMNCurseConfig{
				CurseActions: []fastcurse.CurseActionInput{
					{
						IsGlobalCurse:        false,
						ChainSelector:        tonChainSelector,
						SubjectChainSelector: evmSelector,
						Version:              toolingAPIVersion,
					},
					{
						IsGlobalCurse:        true,
						ChainSelector:        tonChainSelector,
						SubjectChainSelector: 0, // Global curse uses selector 0
						Version:              toolingAPIVersion,
					},
				},
				Force: false,
				MCMS:  mcms.Input{},
			}

			// Apply the curse changeset
			reg := fastcurse.GetCurseRegistry()
			_, err := fastcurse.CurseChangeset(reg, mcmsRegistry).Apply(env, curseCfg)
			require.NoError(t, err, "Failed to apply curse changeset")

			// Verify both subjects are cursed
			isCursed, err := adapter.IsSubjectCursedOnChain(env, tonChainSelector, evmSubject)
			require.NoError(t, err)
			require.True(t, isCursed, "EVM subject should be cursed")

			isCursed, err = adapter.IsSubjectCursedOnChain(env, tonChainSelector, globalSubject)
			require.NoError(t, err)
			require.True(t, isCursed, "Global subject should be cursed")

			t.Log("Successfully cursed multiple subjects")

			// Create uncurse configuration for multiple subjects
			uncurseCfg := fastcurse.RMNCurseConfig{
				CurseActions: []fastcurse.CurseActionInput{
					{
						IsGlobalCurse:        false,
						ChainSelector:        tonChainSelector,
						SubjectChainSelector: evmSelector,
						Version:              toolingAPIVersion,
					},
					{
						IsGlobalCurse:        true,
						ChainSelector:        tonChainSelector,
						SubjectChainSelector: 0, // Global curse uses selector 0
						Version:              toolingAPIVersion,
					},
				},
				Force: false,
				MCMS:  mcms.Input{},
			}

			// Apply the uncurse changeset
			_, err = fastcurse.UncurseChangeset(reg, mcmsRegistry).Apply(env, uncurseCfg)
			require.NoError(t, err, "Failed to apply uncurse changeset")

			// Verify both subjects are uncursed
			isCursed, err = adapter.IsSubjectCursedOnChain(env, tonChainSelector, evmSubject)
			require.NoError(t, err)
			require.False(t, isCursed, "EVM subject should not be cursed")

			isCursed, err = adapter.IsSubjectCursedOnChain(env, tonChainSelector, globalSubject)
			require.NoError(t, err)
			require.False(t, isCursed, "Global subject should not be cursed")

			t.Log("Successfully uncursed multiple subjects")
		})
	})
}

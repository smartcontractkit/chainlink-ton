package ccip

import (
	"math/big"
	"testing"
	"time"

	"github.com/Masterminds/semver/v3"
	chainselectors "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"

	ccipdutils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	datastore_utils "github.com/smartcontractkit/chainlink-ccip/deployment/utils/datastore"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldftesthelpers "github.com/smartcontractkit/chainlink-deployments-framework/engine/cld/mcms/proposalutils/testhelpers"
	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	mcmstypes "github.com/smartcontractkit/mcms/types"
	"github.com/xssnick/tonutils-go/tlb"

	_ "github.com/smartcontractkit/chainlink-ccip/chains/evm/deployment/v1_6_0/sequences"
	deployops "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	"github.com/smartcontractkit/chainlink-ccip/deployment/fastcurse"
	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	cs_core "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"

	ops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences"
	tonchangesets "github.com/smartcontractkit/chainlink-ton/deployment/pkg/changesets"
	tonops "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	deployutils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/rmnremote"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	tvmcodec "github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"

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

	// The bumped chainlink-ccip/deployment requires an UltraFastCurse RBACTimelock to
	// be present before the EVM DeployChainContracts sequence can deploy the RMN (it is
	// passed as the RMN's curse admin). TON does not implement Ultra Fast Curse, so seed
	// a placeholder ref for the EVM chain. See resolveUltraFastCurseTimelock in
	// chainlink-ccip/chains/evm/deployment/v1_6_0/sequences/deploy_chain_contracts.go.
	env, err = SeedUltraFastCurseMCMS(env)
	require.NoError(t, err, "Failed to seed UltraFastCurse MCMS timelock ref")

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

	version := deployutils.ContractsVersionLocal
	cs := commonchangeset.Configure(ops.DeployCCIPContracts{}, ops.DeployChainContractsConfig(t, env, tonChainSelector, version, contractID))

	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")
	// </deploy-ton>

	tonDefinition := lanes.ChainDefinition{
		Selector: tonChain.Selector,
		// See TonLaneAdapter.GetDefaultGasPrice().
		GasPrice: big.NewInt(2.12e9),
		TokenPrices: map[string]*big.Int{
			tvm.TonTokenAddr.String(): big.NewInt(99),
		},
		RMNVerificationEnabled: false,
		AllowListEnabled:       false,
	}

	evmDefinition := lanes.ChainDefinition{
		Selector: evmSelector,
		GasPrice: big.NewInt(1e17),
		TokenPrices: map[string]*big.Int{
			"0x779877A7B0D9E8603169DdbD7836e478b4624789": big.NewInt(99),
		},
		RMNVerificationEnabled: false,
		AllowListEnabled:       false,
	}

	// TON <> EVM lanes
	lanesRegistry := lanes.GetLaneAdapterRegistry()
	out, err = lanes.ConnectChains(lanesRegistry, mcmsRegistry, nil).Apply(env, lanes.ConnectChainsConfig{
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
				Force:                     false,
				AllowAsymmetricLaneCurses: true, // bypass bidirectionality check
				MCMS:                      mcms.Input{},
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
				Force:                     false,
				AllowAsymmetricLaneCurses: true, // bypass bidirectionality check
				MCMS:                      mcms.Input{},
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
				Force:                     false,
				AllowAsymmetricLaneCurses: true, // bypass bidirectionality check
				MCMS:                      mcms.Input{},
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
				Force:                     false,
				AllowAsymmetricLaneCurses: true,
				MCMS:                      mcms.Input{},
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

	// UltraFastCurse: a second, 1-of-N MCMS suite with a zero timelock delay
	// holds CURSE_ROLE so a chain can be cursed fast, while uncursing stays with
	// the RMN owner.
	t.Run("UltraFastCurse", func(t *testing.T) {
		ufcQualifier := "UltraFastCurse"
		ctx := t.Context()
		adapter := &sequences.TonCurseAdapter{}
		require.NoError(t, adapter.Initialize(env, tonChainSelector))
		evmSubject := adapter.SelectorToSubject(evmSelector)

		// 1. Deploy the UltraFastCurse suite. No dedicated sequence: the generic
		// DeployMCMS changeset is parameterized by qualifier.
		signers := cldftesthelpers.SingleGroupMCMS(t)
		mcmsOut, err := deployops.DeployMCMS(dReg, mcmsRegistry).Apply(env, deployops.MCMSDeploymentConfig{
			AdapterVersion: toolingAPIVersion,
			Chains: map[uint64]deployops.MCMSDeploymentConfigPerChain{
				tonChainSelector: {
					Proposer:  signers,
					Canceller: signers,
					Bypasser:  signers,
					// Zero delay is the point of the suite.
					TimelockMinDelay: big.NewInt(0),
					ContractVersion:  version,
					Qualifier:        &ufcQualifier,
				},
			},
		})
		require.NoError(t, err, "Failed to deploy the UltraFastCurse MCMS suite")
		require.NoError(t, mcmsOut.DataStore.Merge(env.DataStore))
		env.DataStore = mcmsOut.DataStore.Seal()

		ufcTimelock, err := datastore_utils.FindAndFormatRef(env.DataStore, datastore.AddressRef{
			ChainSelector: tonChainSelector,
			Type:          datastore.ContractType(ccipdutils.RBACTimelock),
			Qualifier:     ufcQualifier,
		}, tonChainSelector, deployutils.ToTONAddress)
		require.NoError(t, err, "Failed to resolve the UltraFastCurse timelock")

		canCurse, err := tvm.CallGetterLatest(ctx, tonChain.Client, &routerAddr, router.GetRMNCanCurse, ufcTimelock)
		require.NoError(t, err)
		require.False(t, canCurse, "the UltraFastCurse timelock should hold no curse authority yet")

		// commonchangeset.ApplyChangesets rebuilds the operations bundle without
		// an operation registry, so restore it before running a generic sequence.
		env.OperationsBundle.OperationRegistry = tonops.Registry

		// 2. Grant CURSE_ROLE. The deployer is the RMN owner here, so this is a
		// direct send; in production it is an RMNMCMS proposal built from the
		// same message by ton_ops_any_sequence.
		_, err = tonchangesets.NewOpsAnySequence(bindings.Registry, nil).Apply(env, tonchangesets.OpsAnySequence{
			AnySequenceIn: opston.AnySequenceInput{
				Defs: []cldfops.Definition{opston.SendMessages.Def()},
				Inputs: []any{opston.SendMessagesInput{
					Messages: []opston.InternalMessage[any]{
						{
							Bounce:  true,
							DstAddr: &routerAddr,
							Amount:  tlb.MustFromTON("0.1"),
							Body: tvmcodec.MustWrapMessage[any](bindings.PkgCCIP+".Router", router.RMNAccessControlMessage[rbac.GrantRole]{
								Content: tvmcodec.MustWrapMessage[rbac.GrantRole](bindings.TypeRBAC, rbac.GrantRole{
									QueryID: 1,
									Role:    tlbe.NewUint256(rmnremote.CurseRole),
									Account: ufcTimelock,
								}),
							}),
						},
					},
				}},
			},
			Options: opsmcms.TimelockOpts{ChainSelector: mcmstypes.ChainSelector(tonChainSelector)},
		})
		require.NoError(t, err, "Failed to grant CURSE_ROLE to the UltraFastCurse timelock")

		canCurse, err = tvm.CallGetterLatest(ctx, tonChain.Client, &routerAddr, router.GetRMNCanCurse, ufcTimelock)
		require.NoError(t, err)
		require.True(t, canCurse, "the UltraFastCurse timelock should be able to curse")

		canUncurse, err := tvm.CallGetterLatest(ctx, tonChain.Client, &routerAddr, router.GetRMNCanUncurse, ufcTimelock)
		require.NoError(t, err)
		require.False(t, canUncurse, "the UltraFastCurse timelock must not be able to uncurse")

		curseAction := []fastcurse.CurseActionInput{
			{
				IsGlobalCurse:        false,
				ChainSelector:        tonChainSelector,
				SubjectChainSelector: evmSelector,
				Version:              toolingAPIVersion,
			},
		}
		reg := fastcurse.GetCurseRegistry()

		// 3. Curse through the UltraFastCurse suite. ApplyChangesets signs and
		// executes the resulting proposal.
		env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{
			commonchangeset.Configure(fastcurse.CurseChangeset(reg, mcmsRegistry), fastcurse.RMNCurseConfig{
				CurseActions:              curseAction,
				AllowAsymmetricLaneCurses: true,
				MCMS: mcms.Input{
					Qualifier:      ufcQualifier,
					TimelockAction: mcmstypes.TimelockActionSchedule,
					ValidUntil:     uint32(time.Now().Add(time.Hour).Unix()), //nolint:gosec // bounded future timestamp, fits in uint32
					Description:    "ultra fast curse",
				},
			}),
		})
		require.NoError(t, err, "Failed to curse through the UltraFastCurse suite")

		isCursed, err := adapter.IsSubjectCursedOnChain(env, tonChainSelector, evmSubject)
		require.NoError(t, err)
		require.True(t, isCursed, "EVM subject should be cursed through the UltraFastCurse suite")

		// 4. The same suite must not be able to lift the curse; the sequence
		// fails fast rather than producing a proposal that would revert.
		_, err = fastcurse.UncurseChangeset(reg, mcmsRegistry).Apply(env, fastcurse.RMNCurseConfig{
			CurseActions:              curseAction,
			AllowAsymmetricLaneCurses: true,
			MCMS: mcms.Input{
				Qualifier:      ufcQualifier,
				TimelockAction: mcmstypes.TimelockActionSchedule,
				ValidUntil:     uint32(time.Now().Add(time.Hour).Unix()), //nolint:gosec // bounded future timestamp, fits in uint32
			},
		})
		require.ErrorContains(t, err, "may not uncurse")

		// 5. The legacy path still works: the RMN owner uncurses directly.
		_, err = fastcurse.UncurseChangeset(reg, mcmsRegistry).Apply(env, fastcurse.RMNCurseConfig{
			CurseActions:              curseAction,
			AllowAsymmetricLaneCurses: true,
			MCMS:                      mcms.Input{},
		})
		require.NoError(t, err, "the legacy uncurse path must keep working")

		isCursed, err = adapter.IsSubjectCursedOnChain(env, tonChainSelector, evmSubject)
		require.NoError(t, err)
		require.False(t, isCursed, "EVM subject should be uncursed through the legacy path")
	})
}

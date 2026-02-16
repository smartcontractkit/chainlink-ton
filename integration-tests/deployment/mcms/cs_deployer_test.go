package mcms

import (
	"math/big"
	"testing"

	"github.com/Masterminds/semver/v3"
	common "github.com/ethereum/go-ethereum/common"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/tlb"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	mcmstypes "github.com/smartcontractkit/mcms/types"

	cldfchain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	ccipddeploy "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	ccipdutils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	ccipdcs "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	toncommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	_ "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences" // Register TON adapter
	cs "github.com/smartcontractkit/chainlink-ton/deployment/pkg/changesets"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"

	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"
)

func TestDeployMCMSWithDeployerAPI(t *testing.T) {
	t.Parallel()
	lggr := logger.Test(t)

	env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().Build(t)
	require.NoError(t, err)

	// Get chain selectors
	tonChainSelectors := env.BlockChains.ListChainSelectors(cldfchain.WithFamily(chainsel.FamilyTon))
	require.Len(t, tonChainSelectors, 1, "Expected exactly 1 Ton chain")
	chainSelector := tonChainSelectors[0]
	chain := env.BlockChains.TonChains()[chainSelector]
	deployer := chain.Wallet

	t.Log("TON Chain Selector:", chainSelector)
	t.Log("Deployer:", deployer.WalletAddress().String())

	// Testing DeployMCMS from Tooling API
	dReg := ccipddeploy.GetRegistry()
	mcmsRegistry := ccipdcs.GetRegistry()

	version := sequence.ContractsVersionLocal

	configProposer := mcmstypes.Config{
		Quorum: 1,
		Signers: []common.Address{
			common.HexToAddress("0x0000000000000000000000000000000000000021"),
			common.HexToAddress("0x0000000000000000000000000000000000000022"),
		},
		GroupSigners: []mcmstypes.Config{
			{
				Quorum: 2,
				Signers: []common.Address{
					common.HexToAddress("0x0000000000000000000000000000000000000023"),
					common.HexToAddress("0x0000000000000000000000000000000000000024"),
					common.HexToAddress("0x0000000000000000000000000000000000000025"),
				},
				GroupSigners: []mcmstypes.Config{
					{
						Quorum: 1,
						Signers: []common.Address{
							common.HexToAddress("0x0000000000000000000000000000000000000026"),
						},
						GroupSigners: []mcmstypes.Config{},
					},
				},
			},
		},
	}

	configCanceller := mcmstypes.Config{
		Quorum: 1,
		Signers: []common.Address{
			common.HexToAddress("0x0000000000000000000000000000000000000027"),
		},
		GroupSigners: []mcmstypes.Config{},
	}

	configBypasser := mcmstypes.Config{
		Quorum: 1,
		Signers: []common.Address{
			common.HexToAddress("0x0000000000000000000000000000000000000028"),
			common.HexToAddress("0x0000000000000000000000000000000000000029"),
		},
		GroupSigners: []mcmstypes.Config{},
	}

	adapterVersion := semver.MustParse("1.6.0")
	input := ccipddeploy.MCMSDeploymentConfig{
		Chains: map[uint64]ccipddeploy.MCMSDeploymentConfigPerChain{
			chainSelector: {
				Proposer:         configProposer,
				Canceller:        configCanceller,
				Bypasser:         configBypasser,
				TimelockMinDelay: big.NewInt(2),
				ContractVersion:  version,
			},
		},
		AdapterVersion: adapterVersion,
	}

	output, err := ccipddeploy.DeployMCMS(dReg, mcmsRegistry).Apply(env, input)
	require.NoError(t, err, "Failed to deploy MCMS contracts")
	t.Log("Successfully deployed MCMS contracts")

	// Merge deployed contract addresses into environment datastore
	require.NoError(t, output.DataStore.Merge(env.DataStore))
	env.DataStore = output.DataStore.Seal()

	// Verify deployment
	mcmsState, err := state.LoadMCMSOnChainState(env)
	require.NoError(t, err)

	ctx := t.Context()
	addrCodec := codec.NewAddressCodec()
	mc, err := chain.Client.GetMasterchainInfo(ctx)
	require.NoError(t, err)

	qualifier := ccipdutils.CLLQualifier // default

	suiteState := mcmsState[chainSelector].ByQualifier[qualifier]
	// Verify timelock address
	timelockAddr := suiteState.Timelock
	_, err = addrCodec.AddressStringToBytes(timelockAddr.String())
	require.NoError(t, err)

	// Verify timelock is initialized
	isInitializedResponse, err := chain.Client.RunGetMethod(ctx, mc, timelockAddr, "isInitialized")
	require.NoError(t, err)
	rawIsInitialized, err := isInitializedResponse.Int(0)
	require.NoError(t, err)
	isInitialized := rawIsInitialized.Sign() != 0
	require.True(t, isInitialized, "Timelock should be initialized")

	// Verify timelock roles
	rm, err := tvm.CallGetter(ctx, chain.Client, mc, timelockAddr, timelock.GetRoleMember, timelock.GetRoleMemberArgs{
		Role:  timelock.RoleProposer,
		Index: 0,
	})
	require.NoError(t, err)
	require.NotNil(t, rm)
	require.Equal(t, suiteState.Proposer.String(), rm.String(), "Proposer role should be assigned to proposer MCMS address")

	rm, err = tvm.CallGetter(ctx, chain.Client, mc, timelockAddr, timelock.GetRoleMember, timelock.GetRoleMemberArgs{
		Role:  timelock.RoleCanceller,
		Index: 0,
	})
	require.NoError(t, err)
	require.NotNil(t, rm)
	require.Equal(t, suiteState.Canceller.String(), rm.String(), "Canceller role should be assigned to canceller MCMS address")

	rm, err = tvm.CallGetter(ctx, chain.Client, mc, timelockAddr, timelock.GetRoleMember, timelock.GetRoleMemberArgs{
		Role:  timelock.RoleBypasser,
		Index: 0,
	})
	require.NoError(t, err)
	require.NotNil(t, rm)
	require.Equal(t, suiteState.Bypasser.String(), rm.String(), "Bypasser role should be assigned to bypasser MCMS address")

	rm, err = tvm.CallGetter(ctx, chain.Client, mc, timelockAddr, timelock.GetRoleMember, timelock.GetRoleMemberArgs{
		Role:  timelock.RoleExecutor,
		Index: 0,
	})
	require.NoError(t, err)
	require.Nil(t, rm)

	rm, err = tvm.CallGetter(ctx, chain.Client, mc, timelockAddr, timelock.GetRoleMember, timelock.GetRoleMemberArgs{
		Role:  timelock.RoleAdmin,
		Index: 0,
	})
	require.NoError(t, err)
	require.NotNil(t, rm)

	shouldBeDeployer5 := rm
	expectedDeployerAddr := deployer.WalletAddress().Bounce(true).String()
	require.Equal(t, expectedDeployerAddr, shouldBeDeployer5.String(), "Admin should be deployer")
	t.Log("Verified all timelock admin is set to deployer, while other roles are empty")

	// Verify MCMS contract
	mcmsAddr := suiteState.Proposer
	tv, err := tvm.CallGetter(ctx, chain.Client, mc, mcmsAddr, toncommon.GetTypeAndVersion)
	require.NoError(t, err)
	require.Equal(t, "com.chainlink.ton.mcms.MCMS", tv.Type, "MCMS contract type should match")
	t.Log("Verified MCMS contract type and version")

	config, err := tvm.CallGetterLatest(ctx, chain.Client, mcmsAddr, mcms.GetConfig)
	require.NoError(t, err)
	require.NotNil(t, config)
	require.Len(t, config.Signers.AsMap(), 6, "Config should have 6 signers in total")
	t.Log("Verified MCMS config has correct number of signers")

	// Test idempotency by deploying again
	t.Log("Testing idempotency by deploying again")
	dReg = ccipddeploy.GetRegistry()
	output, err = ccipddeploy.DeployMCMS(dReg, mcmsRegistry).Apply(env, input)
	require.NoError(t, err, "Failed to deploy MCMS contracts on second attempt")
	t.Log("Successfully verified idempotency - second deployment succeeded")

	// Merge deployed contract addresses into environment datastore
	require.NoError(t, output.DataStore.Merge(env.DataStore))
	env.DataStore = output.DataStore.Seal()

	// Verify state is still correct after idempotent deployment
	mcmsState, err = state.LoadMCMSOnChainState(env)
	require.NoError(t, err)
	suiteState = mcmsState[chainSelector].ByQualifier[qualifier]

	mcmsAddr = suiteState.Proposer
	tv, err = tvm.CallGetter(ctx, chain.Client, mc, mcmsAddr, toncommon.GetTypeAndVersion)
	require.NoError(t, err)
	require.Equal(t, "com.chainlink.ton.mcms.MCMS", tv.Type, "MCMS contract type should match")
	t.Log("Verified MCMS contract type and version")

	timelockAddr = suiteState.Timelock
	_, err = addrCodec.AddressStringToBytes(timelockAddr.String())
	require.NoError(t, err)

	// Verify timelock is still initialized
	isInitializedResponse, err = chain.Client.RunGetMethod(ctx, mc, timelockAddr, "isInitialized")
	require.NoError(t, err)
	rawIsInitialized, err = isInitializedResponse.Int(0)
	require.NoError(t, err)
	isInitialized = rawIsInitialized.Sign() != 0
	require.True(t, isInitialized, "Timelock should still be initialized after idempotent deployment")
	t.Log("Verified timelock is still initialized after idempotent deployment")

	// Reconfigure with setConfig and verify config is updated correctly
	output, err = cs.NewOpsAnySequence(bindings.Registry, nil).Apply(env, cs.OpsAnySequence{
		AnySequenceIn: opston.AnySequenceInput{
			Defs: []cldfops.Definition{
				opsmcms.SetConfig.Def(),
			},
			Inputs: []any{
				opsmcms.SetConfigInput{
					DstAddr: mcmsAddr,
					Amount:  tlb.MustFromTON("0.1"),
					Config:  &TestMCMSConfig1,
				},
			},
		},
		Options: opsmcms.TimelockOpts{
			ChainSelector: mcmstypes.ChainSelector(chainSelector),
		},
	})
	require.NoError(t, err, "Failed to execute setConfig in sequence")

	config, err = tvm.CallGetterLatest(ctx, chain.Client, mcmsAddr, mcms.GetConfig)
	require.NoError(t, err)
	require.NotNil(t, config)
	require.Len(t, config.Signers.AsMap(), 1, "Config should have 1 signer in total after setConfig")
}

package mcms

import (
	"math/big"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	chainselectors "github.com/smartcontractkit/chain-selectors"

	mcmstypes "github.com/smartcontractkit/mcms/types"

	ccipddeploy "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	ccipdutils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	ccipdcs "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"

	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	_ "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences" // Register TON adapter
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"

	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"
)

func TestDeployMCMSWithDeployerAPI(t *testing.T) {
	t.Parallel()
	lggr := logger.Test(t)

	env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().Build(t)
	require.NoError(t, err)

	// Get chain selectors
	tonChainSelectors := env.BlockChains.ListChainSelectors(chain.WithFamily(chainselectors.FamilyTon))
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

	// Note: The MCMSDeploymentConfigPerChain uses EVM-specific types (common.Address),
	// but the TON adapter ignores these and uses the deployer address for all roles.
	// We provide zero values here as they will be replaced by the adapter.
	adapterVersion := semver.MustParse("1.6.0")
	output, err := ccipddeploy.DeployMCMS(dReg, mcmsRegistry).Apply(env, ccipddeploy.MCMSDeploymentConfig{
		Chains: map[uint64]ccipddeploy.MCMSDeploymentConfigPerChain{
			chainSelector: {
				Canceller:        mcmstypes.Config{}, // Will be replaced by TON adapter
				Bypasser:         mcmstypes.Config{}, // Will be replaced by TON adapter
				Proposer:         mcmstypes.Config{}, // Will be replaced by TON adapter
				TimelockMinDelay: big.NewInt(0),
				ContractVersion:  version,
			},
		},
		AdapterVersion: adapterVersion,
	})
	require.NoError(t, err, "Failed to deploy MCMS contracts")
	t.Log("Successfully deployed MCMS contracts")

	// Merge deployed contract addresses into environment datastore
	require.NoError(t, output.DataStore.Merge(env.DataStore))
	env.DataStore = output.DataStore.Seal()

	// Verify deployment
	mcmsState, err := tonstate.LoadMCMSOnChainState(env)
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
	tv, err := tvm.CallGetter(ctx, chain.Client, mc, mcmsAddr, common.GetTypeAndVersion)
	require.NoError(t, err)
	require.Equal(t, "com.chainlink.ton.mcms.MCMS", tv.Type, "MCMS contract type should match")
	t.Log("Verified MCMS contract type and version")

	// Test idempotency by deploying again
	t.Log("Testing idempotency by deploying again")
	dReg = ccipddeploy.GetRegistry()
	output, err = ccipddeploy.DeployMCMS(dReg, mcmsRegistry).Apply(env, ccipddeploy.MCMSDeploymentConfig{
		Chains: map[uint64]ccipddeploy.MCMSDeploymentConfigPerChain{
			chainSelector: {
				Canceller:        mcmstypes.Config{},
				Bypasser:         mcmstypes.Config{},
				Proposer:         mcmstypes.Config{},
				TimelockMinDelay: big.NewInt(0),
				ContractVersion:  version,
			},
		},
		AdapterVersion: adapterVersion,
	})
	require.NoError(t, err, "Failed to deploy MCMS contracts on second attempt")
	t.Log("Successfully verified idempotency - second deployment succeeded")

	// Merge deployed contract addresses into environment datastore
	require.NoError(t, output.DataStore.Merge(env.DataStore))
	env.DataStore = output.DataStore.Seal()

	// Verify state is still correct after idempotent deployment
	mcmsState, err = tonstate.LoadMCMSOnChainState(env)
	require.NoError(t, err)
	suiteState = mcmsState[chainSelector].ByQualifier[qualifier]

	mcmsAddr = suiteState.Proposer
	tv, err = tvm.CallGetter(ctx, chain.Client, mc, mcmsAddr, common.GetTypeAndVersion)
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
}

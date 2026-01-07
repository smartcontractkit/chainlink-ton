package mcms

import (
	"math/big"
	"testing"

	"github.com/Masterminds/semver/v3"
	chainselectors "github.com/smartcontractkit/chain-selectors"
	deployops "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	cs_ccip "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"
	mcmstypes "github.com/smartcontractkit/mcms/types"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"

	_ "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences" // Register TON adapter
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
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
	tonChain := env.BlockChains.TonChains()[chainSelector]
	deployer := tonChain.Wallet

	t.Log("TON Chain Selector:", chainSelector)
	t.Log("Deployer:", deployer.WalletAddress().String())

	// Testing DeployMCMS from Tooling API
	dReg := deployops.GetRegistry()
	mcmsRegistry := cs_ccip.GetRegistry()

	// Note: The MCMSDeploymentConfigPerChain uses EVM-specific types (common.Address),
	// but the TON adapter ignores these and uses the deployer address for all roles.
	// We provide zero values here as they will be replaced by the adapter.
	adapterVersion := semver.MustParse("1.6.0")
	output, err := deployops.DeployMCMS(dReg, mcmsRegistry).Apply(env, deployops.MCMSDeploymentConfig{
		Chains: map[uint64]deployops.MCMSDeploymentConfigPerChain{
			chainSelector: {
				Canceller:        mcmstypes.Config{}, // Will be replaced by TON adapter
				Bypasser:         mcmstypes.Config{}, // Will be replaced by TON adapter
				Proposer:         mcmstypes.Config{}, // Will be replaced by TON adapter
				TimelockMinDelay: big.NewInt(0),
				ContractVersion:  sequence.ContractsLocalVersion,
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
	mc, err := tonChain.Client.GetMasterchainInfo(ctx)
	require.NoError(t, err)

	// Verify timelock address
	timelockAddr := mcmsState[chainSelector].Timelock
	_, err = addrCodec.AddressStringToBytes(timelockAddr.String())
	require.NoError(t, err)

	// Verify timelock is initialized
	isInitializedResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "isInitialized")
	require.NoError(t, err)
	rawIsInitialized, err := isInitializedResponse.Int(0)
	require.NoError(t, err)
	isInitialized := rawIsInitialized.Sign() != 0
	require.True(t, isInitialized, "Timelock should be initialized")

	// Verify timelock roles (all should be the deployer)
	getProposerResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleProposer)
	require.NoError(t, err)
	getExecutorResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleExecutor)
	require.NoError(t, err)
	getCancellerResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleCanceller)
	require.NoError(t, err)
	getBypasserResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleBypasser)
	require.NoError(t, err)
	getAdminResponse, err := tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleAdmin)
	require.NoError(t, err)

	require.True(t, getProposerResponse.MustIsNil(0), "Proposer should be empty")
	require.True(t, getExecutorResponse.MustIsNil(0), "Executor should be empty")
	require.True(t, getCancellerResponse.MustIsNil(0), "Canceller should be empty")
	require.True(t, getBypasserResponse.MustIsNil(0), "Bypasser should be empty")
	shouldBeDeployer5 := getAdminResponse.MustSlice(0).MustLoadAddr()

	expectedDeployerAddr := deployer.WalletAddress().Bounce(true).String()
	require.Equal(t, expectedDeployerAddr, shouldBeDeployer5.String(), "Admin should be deployer")
	t.Log("Verified all timelock admin is set to deployer, while other roles are empty")

	// Verify MCMS contract
	mcmsAddr := mcmsState[chainSelector].MCMS
	var tv common.TypeAndVersion
	err = tvm.FetchResult(ctx, tonChain.Client, mc, &mcmsAddr, &tv, nil)
	require.NoError(t, err)
	require.Equal(t, "com.chainlink.ton.mcms.MCMS", tv.Type, "MCMS contract type should match")
	t.Log("Verified MCMS contract type and version")

	// Test idempotency by deploying again
	t.Log("Testing idempotency by deploying again")
	dReg = deployops.GetRegistry()
	output, err = deployops.DeployMCMS(dReg, mcmsRegistry).Apply(env, deployops.MCMSDeploymentConfig{
		Chains: map[uint64]deployops.MCMSDeploymentConfigPerChain{
			chainSelector: {
				Canceller:        mcmstypes.Config{},
				Bypasser:         mcmstypes.Config{},
				Proposer:         mcmstypes.Config{},
				TimelockMinDelay: big.NewInt(0),
				ContractVersion:  sequence.ContractsLocalVersion,
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

	mcmsAddr = mcmsState[chainSelector].MCMS
	err = tvm.FetchResult(ctx, tonChain.Client, mc, &mcmsAddr, &tv, nil)
	require.NoError(t, err)
	require.Equal(t, "com.chainlink.ton.mcms.MCMS", tv.Type, "MCMS contract type should match")
	t.Log("Verified MCMS contract type and version")

	timelockAddr = mcmsState[chainSelector].Timelock
	_, err = addrCodec.AddressStringToBytes(timelockAddr.String())
	require.NoError(t, err)

	// Verify timelock is still initialized
	isInitializedResponse, err = tonChain.Client.RunGetMethod(ctx, mc, &timelockAddr, "isInitialized")
	require.NoError(t, err)
	rawIsInitialized, err = isInitializedResponse.Int(0)
	require.NoError(t, err)
	isInitialized = rawIsInitialized.Sign() != 0
	require.True(t, isInitialized, "Timelock should still be initialized after idempotent deployment")
	t.Log("Verified timelock is still initialized after idempotent deployment")
}

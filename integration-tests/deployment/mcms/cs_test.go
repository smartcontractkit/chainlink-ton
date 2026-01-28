package mcms

import (
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/stretchr/testify/require"

	chainselectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"
	commonchangeset "github.com/smartcontractkit/chainlink/deployment/common/changeset"

	tonops "github.com/smartcontractkit/chainlink-ton/deployment/ccip"
	"github.com/smartcontractkit/chainlink-ton/deployment/mcms/changesets"
	mcmsConfig "github.com/smartcontractkit/chainlink-ton/deployment/mcms/config"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"
)

func TestDeployMCMS(t *testing.T) {
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

	t.Log("Deployer: ", deployer.WalletAddress().String())

	// Random contract's ID to avoid collision on subsequence runs of the test against the same chain node
	contractID, err := tonops.RandomUint32()
	require.NoError(t, err)

	version := sequence.ContractsVersionLatestSupported

	timelockContractSemver := semver.MustParse("0.0.3")
	mcmsContractSemver := semver.MustParse("0.0.4")
	cfg := changesets.DeployMCMSContractsCfg{
		ChainSelector: chainSelector,
		ContractParams: mcmsConfig.ChainContractParams{
			Timelock: mcmsConfig.TimelockParams{
				ID:              contractID,
				Coin:            "0.5",
				ContractsSemver: timelockContractSemver,
				InitMessage: timelock.Init{
					MinDelay:   0,
					Admin:      deployer.WalletAddress(),
					Proposers:  []common.AddressWrap{{Val: deployer.WalletAddress()}},
					Executors:  []common.AddressWrap{{Val: deployer.WalletAddress()}},
					Cancellers: []common.AddressWrap{{Val: deployer.WalletAddress()}},
					Bypassers:  []common.AddressWrap{{Val: deployer.WalletAddress()}},
				},
			},
			MCMS: mcmsConfig.MCMSParams{
				ID:              contractID,
				ContractsSemver: mcmsContractSemver,
				Coin:            "0.5",
			},
		},
		ContractsVersion: version,
	}

	cs := commonchangeset.Configure(changesets.DeployMCMSContracts{}, cfg)
	env, _, err = commonchangeset.ApplyChangesets(t, env, []commonchangeset.ConfiguredChangeSet{cs})
	require.NoError(t, err, "failed to deploy ccip")

	mcmsState, err := tonstate.LoadMCMSOnChainState(env)
	require.NoError(t, err)

	ctx := t.Context()
	addrCodec := codec.NewAddressCodec()
	mc, err := chain.Client.GetMasterchainInfo(ctx)
	require.NoError(t, err)

	// <Verify timelock address>
	timelockAddr := mcmsState[chainSelector].Timelock
	_, err = addrCodec.AddressStringToBytes(timelockAddr.String())
	require.NoError(t, err)
	isInitializedResponse, err := chain.Client.RunGetMethod(ctx, mc, &timelockAddr, "isInitialized")
	require.NoError(t, err)
	rawIsInitialized, err := isInitializedResponse.Int(0)
	require.NoError(t, err)
	isInitialized := rawIsInitialized.Sign() != 0
	require.True(t, isInitialized)
	getProposerResponse, err := chain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleProposer)
	require.NoError(t, err)
	getExecutorResponse, err := chain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleExecutor)
	require.NoError(t, err)
	getCancellerResponse, err := chain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleCanceller)
	require.NoError(t, err)
	getBypasserResponse, err := chain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleBypasser)
	require.NoError(t, err)
	getAdminResponse, err := chain.Client.RunGetMethod(ctx, mc, &timelockAddr, "getRoleMemberFirst", timelock.RoleAdmin)
	require.NoError(t, err)
	shouldBeDeployer1 := getProposerResponse.MustSlice(0).MustLoadAddr()
	shouldBeDeployer2 := getExecutorResponse.MustSlice(0).MustLoadAddr()
	shouldBeDeployer3 := getCancellerResponse.MustSlice(0).MustLoadAddr()
	shouldBeDeployer4 := getBypasserResponse.MustSlice(0).MustLoadAddr()
	shouldBeDeployer5 := getAdminResponse.MustSlice(0).MustLoadAddr()
	require.Equal(t, deployer.WalletAddress().Bounce(true).String(), shouldBeDeployer1.String())
	require.Equal(t, deployer.WalletAddress().Bounce(true).String(), shouldBeDeployer2.String())
	require.Equal(t, deployer.WalletAddress().Bounce(true).String(), shouldBeDeployer3.String())
	require.Equal(t, deployer.WalletAddress().Bounce(true).String(), shouldBeDeployer4.String())
	require.Equal(t, deployer.WalletAddress().Bounce(true).String(), shouldBeDeployer5.String())
	// </Verify timelock address>

	// <Verify MCMS address>
	mcmsAddr := mcmsState[chainSelector].MCMS
	tv, err := tvm.CallGetter(ctx, chain.Client, mc, &mcmsAddr, common.GetTypeAndVersion)
	require.NoError(t, err)
	require.Equal(t, "com.chainlink.ton.mcms.MCMS", tv.Type)
	// </Verify MCMS address>
}

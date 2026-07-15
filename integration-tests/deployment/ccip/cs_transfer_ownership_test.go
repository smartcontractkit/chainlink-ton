package ccip

import (
	"math/big"
	"testing"

	"github.com/Masterminds/semver/v3"
	"github.com/stretchr/testify/require"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	chainsel "github.com/smartcontractkit/chain-selectors"
	mcmstypes "github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldfds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"

	ccipddeploy "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	ccipdutils "github.com/smartcontractkit/chainlink-ccip/deployment/utils"
	ccipdcs "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	_ "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences" // Register TON adapter
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	deployutils "github.com/smartcontractkit/chainlink-ton/deployment/utils"

	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"

	testsmcms "github.com/smartcontractkit/chainlink-ton/integration-tests/deployment/mcms"
)

func TestTransferOwnershipWithDeployerAPI(t *testing.T) {
	t.Parallel()
	lggr := logger.Test(t)

	env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().Build(t)
	require.NoError(t, err)

	selector := env.BlockChains.ListChainSelectors(chain.WithFamily(chainsel.FamilyTon))[0]
	tonChain := env.BlockChains.TonChains()[selector]

	version := deployutils.ContractsVersionLocal

	// Step 1: Deploy CCIP contracts (deployer becomes owner)
	dReg := ccipddeploy.GetRegistry()
	output, err := ccipddeploy.DeployContracts(dReg).Apply(env, ccipddeploy.ContractDeploymentConfig{
		Chains: map[uint64]ccipddeploy.ContractDeploymentConfigPerChain{
			selector: {
				Version:                                 &state.Version1_6_0,
				TokenDecimals:                           9,
				MaxFeeJuelsPerMsg:                       big.NewInt(1),
				TokenPriceStalenessThreshold:            0,
				LinkPremiumMultiplier:                   1,
				PermissionLessExecutionThresholdSeconds: 0,
				ContractVersion:                         version,
			},
		},
	})
	require.NoError(t, err, "Failed to deploy TON chain contracts")

	require.NoError(t, output.DataStore.Merge(env.DataStore))
	env.DataStore = output.DataStore.Seal()

	// Step 1.5: Deploy MCMS contracts (needed for transfer ownership timelock reference)
	mcmsRegistry := ccipdcs.GetRegistry()
	adapterVersion := semver.MustParse("1.6.0")
	dReg = ccipddeploy.GetRegistry()
	output, err = ccipddeploy.DeployMCMS(dReg, mcmsRegistry).Apply(env, ccipddeploy.MCMSDeploymentConfig{
		Chains: map[uint64]ccipddeploy.MCMSDeploymentConfigPerChain{
			selector: {
				Canceller:        testsmcms.TestMCMSConfig1,
				Bypasser:         testsmcms.TestMCMSConfig1,
				Proposer:         testsmcms.TestMCMSConfig1,
				TimelockMinDelay: big.NewInt(0),
				ContractVersion:  version,
			},
		},
		AdapterVersion: adapterVersion,
	})
	require.NoError(t, err, "Failed to deploy MCMS contracts")
	t.Log("Successfully deployed MCMS contracts")

	require.NoError(t, output.DataStore.Merge(env.DataStore))
	env.DataStore = output.DataStore.Seal()

	// Load state to get contract addresses

	stateMCMS, err := state.LoadMCMSOnChainState(env)
	require.NoError(t, err)
	stateMCMSChainQ := stateMCMS[selector].ByQualifier[ccipdutils.CLLQualifier]

	stateCCIP, err := state.LoadOnchainState(env)
	require.NoError(t, err)
	stateCCIPChain := stateCCIP[selector]

	deployerAddr := tonChain.WalletAddress

	type contractEntry struct {
		name string
		addr *address.Address
	}
	contracts := []contractEntry{
		{"Router", &stateCCIPChain.Router},
		{"OnRamp", &stateCCIPChain.OnRamp},
		{"OffRamp", &stateCCIPChain.OffRamp},
		{"FeeQuoter", &stateCCIPChain.FeeQuoter},
		// MCMS contracts
		{"Proposer", stateMCMSChainQ.Proposer},
		{"Canceller", stateMCMSChainQ.Canceller},
		{"Bypasser", stateMCMSChainQ.Bypasser},
	}

	// Step 2: Verify deployer is the initial owner of all contracts
	for _, c := range contracts {
		var owner *address.Address
		owner, err = tvm.CallGetterLatest(t.Context(), tonChain.Client, c.addr, ownable2step.GetOwner)
		require.NoError(t, err, "failed to get owner for %s", c.name)
		require.True(t, deployerAddr.Equals(owner), "%s should be owned by deployer, got %s", c.name, owner.String())
		t.Logf("%s at %s is owned by deployer %s", c.name, c.addr.String(), owner.String())
	}

	// Step 3: Create a new wallet as the proposed new owner
	newOwnerWallet, err := tvm.NewRandomV5R1TestWallet(tonChain.Client, -217)
	require.NoError(t, err)

	// Fund and initialize the new wallet
	err = tvm.NewInitializedWallet(t.Context(), tonChain.Wallet, newOwnerWallet, tlb.MustFromTON("1"))
	require.NoError(t, err)
	t.Logf("New owner wallet created and funded: %s", newOwnerWallet.WalletAddress().String())

	// Step 4: Build contract refs for the contracts to transfer
	contractRefs := []cldfds.AddressRef{
		{Address: stateCCIPChain.Router.String(), Type: state.Router, ChainSelector: selector},
		{Address: stateCCIPChain.OnRamp.String(), Type: state.OnRamp, ChainSelector: selector},
		{Address: stateCCIPChain.OffRamp.String(), Type: state.OffRamp, ChainSelector: selector},
		{Address: stateCCIPChain.FeeQuoter.String(), Type: state.FeeQuoter, ChainSelector: selector},
		// MCMS contracts
		{Address: stateMCMSChainQ.Proposer.String(), Type: cldfds.ContractType(ccipdutils.ProposerManyChainMultisig), ChainSelector: selector},
		{Address: stateMCMSChainQ.Canceller.String(), Type: cldfds.ContractType(ccipdutils.CancellerManyChainMultisig), ChainSelector: selector},
		{Address: stateMCMSChainQ.Bypasser.String(), Type: cldfds.ContractType(ccipdutils.BypasserManyChainMultisig), ChainSelector: selector},
	}

	// Step 5: Transfer ownership from deployer to new wallet via the tooling API.
	// Since the deployer is the current owner, the adapter sends TransferOwnership
	// messages directly (plan=false). ShouldAcceptOwnershipWithTransferOwnership returns
	// false because the proposed owner is the new wallet (not the deployer), so the
	// changeset only performs the transfer step — accept is handled separately below.
	toRegistry := ccipddeploy.GetTransferOwnershipRegistry()

	transferInput := ccipddeploy.TransferOwnershipInput{
		ChainInputs: []ccipddeploy.TransferOwnershipPerChainInput{
			{
				ChainSelector: selector,
				ContractRef:   contractRefs,
				CurrentOwner:  deployerAddr.String(),
				ProposedOwner: newOwnerWallet.WalletAddress().String(),
			},
		},
		AdapterVersion: &state.Version1_6_0,
		MCMS: mcms.Input{
			TimelockAction: mcmstypes.TimelockActionSchedule,
		},
	}

	_, err = ccipddeploy.TransferOwnershipChangeset(toRegistry, mcmsRegistry).Apply(env, transferInput)
	require.NoError(t, err, "Failed to transfer ownership")
	t.Log("Successfully transferred ownership")

	// Step 6: Verify pending owner is set for all contracts
	for _, c := range contracts {
		var pendingOwner *address.Address
		pendingOwner, err = tvm.CallGetterLatest(t.Context(), tonChain.Client, c.addr, ownable2step.GetPendingOwner)
		require.NoError(t, err, "failed to get pending owner for %s", c.name)
		require.True(t, newOwnerWallet.WalletAddress().Equals(pendingOwner),
			"%s pending owner should be new wallet %s, got %s", c.name, newOwnerWallet.WalletAddress().String(), pendingOwner.String())
		t.Logf("%s pending owner set to %s", c.name, pendingOwner.String())
	}

	// Step 7: Verify current owner is still the deployer (transfer only sets pending, not actual)
	for _, c := range contracts {
		var owner *address.Address
		owner, err = tvm.CallGetterLatest(t.Context(), tonChain.Client, c.addr, ownable2step.GetOwner)
		require.NoError(t, err, "failed to get owner for %s", c.name)
		require.True(t, deployerAddr.Equals(owner),
			"%s should still be owned by deployer after transfer (before accept), got %s", c.name, owner.String())
	}

	// Step 8: Accept ownership by sending AcceptOwnership directly from the new owner wallet.
	// The adapter's SequenceAcceptOwnership would set plan=true here (since the sender/deployer
	// is not the proposed owner), which requires MCMS. For this test without MCMS, we send the
	// AcceptOwnership message directly from the new owner wallet.
	for _, c := range contracts {
		body := ownable2step.AcceptOwnership{}
		var bodyCell *cell.Cell
		bodyCell, err = tlb.ToCell(body)
		require.NoError(t, err, "failed to encode AcceptOwnership for %s", c.name)

		var tx *tlb.Transaction
		tx, _, err = newOwnerWallet.SendWaitTransaction(t.Context(), &wallet.Message{
			Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      true,
				DstAddr:     c.addr,
				Amount:      tlb.MustFromTON("0.1"),
				Body:        bodyCell,
			},
		})
		require.NoError(t, err, "failed to accept ownership for %s", c.name)

		// Wait for the internal message to be delivered and processed by the contract
		err = tracetracking.WaitForTrace(t.Context(), tonChain.Client, tx)
		require.NoError(t, err, "failed to wait for AcceptOwnership trace for %s", c.name)
		t.Logf("AcceptOwnership sent for %s from new owner %s", c.name, newOwnerWallet.WalletAddress().String())
	}

	// Step 9: Verify new owner is now the actual owner of all contracts
	for _, c := range contracts {
		var owner *address.Address
		owner, err = tvm.CallGetterLatest(t.Context(), tonChain.Client, c.addr, ownable2step.GetOwner)
		require.NoError(t, err, "failed to get owner for %s", c.name)
		require.True(t, newOwnerWallet.WalletAddress().Equals(owner),
			"%s should be owned by new wallet %s, got %s", c.name, newOwnerWallet.WalletAddress().String(), owner.String())
		t.Logf("%s ownership transferred to %s", c.name, owner.String())
	}
}

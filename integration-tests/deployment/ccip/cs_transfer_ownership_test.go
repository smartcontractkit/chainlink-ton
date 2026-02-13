package ccip

import (
	"math/big"
	"testing"

	"github.com/Masterminds/semver/v3"
	chainselectors "github.com/smartcontractkit/chain-selectors"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	mcms_types "github.com/smartcontractkit/mcms/types"

	deployops "github.com/smartcontractkit/chainlink-ccip/deployment/deploy"
	cs_ccip "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/sequence"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	_ "github.com/smartcontractkit/chainlink-ton/deployment/ccip/1_6_0/sequences" // Register TON adapter
	devenv "github.com/smartcontractkit/chainlink-ton/integration-tests/env"
)

func TestTransferOwnershipWithDeployerAPI(t *testing.T) {
	t.Parallel()
	lggr := logger.Test(t)

	env, err := devenv.NewTestEnvironmentBuilder(lggr).WithTON().Build(t)
	require.NoError(t, err)

	tonSelector := env.BlockChains.ListChainSelectors(chain.WithFamily(chainselectors.FamilyTon))[0]
	tonChain := env.BlockChains.TonChains()[tonSelector]

	version := sequence.ContractsVersionLocal

	// Step 1: Deploy CCIP contracts (deployer becomes owner)
	dReg := deployops.GetRegistry()
	output, err := deployops.DeployContracts(dReg).Apply(env, deployops.ContractDeploymentConfig{
		Chains: map[uint64]deployops.ContractDeploymentConfigPerChain{
			tonSelector: {
				Version:                                 &tonstate.Version1_6_0,
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
	mcmsRegistry := cs_ccip.GetRegistry()
	adapterVersion := semver.MustParse("1.6.0")
	dReg = deployops.GetRegistry()
	output, err = deployops.DeployMCMS(dReg, mcmsRegistry).Apply(env, deployops.MCMSDeploymentConfig{
		Chains: map[uint64]deployops.MCMSDeploymentConfigPerChain{
			tonSelector: {
				Canceller:        mcms_types.Config{},
				Bypasser:         mcms_types.Config{},
				Proposer:         mcms_types.Config{},
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
	state, err := tonstate.LoadOnchainState(env)
	require.NoError(t, err)
	chainState := state[tonSelector]

	deployerAddr := tonChain.WalletAddress

	type contractEntry struct {
		name string
		addr *address.Address
	}
	contracts := []contractEntry{
		{"Router", &chainState.Router},
		{"OnRamp", &chainState.OnRamp},
		{"OffRamp", &chainState.OffRamp},
		{"FeeQuoter", &chainState.FeeQuoter},
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
	contractRefs := []datastore.AddressRef{
		{Address: chainState.Router.String(), Type: tonstate.Router, ChainSelector: tonSelector, Version: &tonstate.Version1_6_0},
		{Address: chainState.OnRamp.String(), Type: tonstate.OnRamp, ChainSelector: tonSelector, Version: &tonstate.Version1_6_0},
		{Address: chainState.OffRamp.String(), Type: tonstate.OffRamp, ChainSelector: tonSelector, Version: &tonstate.Version1_6_0},
		{Address: chainState.FeeQuoter.String(), Type: tonstate.FeeQuoter, ChainSelector: tonSelector, Version: &tonstate.Version1_6_0},
	}

	// Step 5: Transfer ownership from deployer to new wallet via the tooling API.
	// Since the deployer is the current owner, the adapter sends TransferOwnership
	// messages directly (plan=false). ShouldAcceptOwnershipWithTransferOwnership returns
	// false because the proposed owner is the new wallet (not the deployer), so the
	// changeset only performs the transfer step — accept is handled separately below.
	toRegistry := deployops.GetTransferOwnershipRegistry()

	transferInput := deployops.TransferOwnershipInput{
		ChainInputs: []deployops.TransferOwnershipPerChainInput{
			{
				ChainSelector: tonSelector,
				ContractRef:   contractRefs,
				CurrentOwner:  deployerAddr.String(),
				ProposedOwner: newOwnerWallet.WalletAddress().String(),
			},
		},
		AdapterVersion: &tonstate.Version1_6_0,
		MCMS: mcms.Input{
			TimelockAction: mcms_types.TimelockActionSchedule,
		},
	}

	_, err = deployops.TransferOwnershipChangeset(toRegistry, mcmsRegistry).Apply(env, transferInput)
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

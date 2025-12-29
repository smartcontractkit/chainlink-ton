package changesets

import (
	"fmt"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

var _ cldf.ChangeSetV2[opsmcms.TimelockAnySequenceInput] = OpsAnySequence{}

// OpsAnySequence deploys MCMS packages and modules
type OpsAnySequence struct{}

func (cs OpsAnySequence) VerifyPreconditions(_ cldf.Environment, _ opsmcms.TimelockAnySequenceInput) error {
	return nil
}

func (cs OpsAnySequence) Apply(env cldf.Environment, in opsmcms.TimelockAnySequenceInput) (cldf.ChangesetOutput, error) {
	selector := types.ChainSelector(in.ChainSelector)

	// Address resolution: load existing MCMS and Timelock addresses if not provided
	mcmsStates, err := state.LoadMCMSOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load MCMS onchain state: %w", err)
	}
	state, ok := mcmsStates[uint64(selector)]
	if ok {
		if in.MCMSAddr == nil {
			in.MCMSAddr = &state.MCMS
		}
		if in.TimelockAddr == nil {
			in.TimelockAddr = &state.Timelock
		}
	}

	tonChains := env.BlockChains.TonChains()
	chain := tonChains[uint64(selector)]

	// Dependencies currently injected per-operation
	// TODO: generalize dependency injection per-type/s in sequences
	deps := ops.AnySequenceDeps{}
	deps["chain"] = chain
	deps[ops.SendMessages.Def().ID] = ops.SendMessagesDeps{
		Wallet: chain.Wallet,
	}

	reports := make([]operations.Report[any, any], 0)

	// Execute the (any) sequence based on the provided input
	r, err := operations.ExecuteSequence(env.OperationsBundle, opsmcms.TimelockAnySequence, deps, in)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to deploy MCMS for TON chain %d: %w", selector, err)
	}

	reports = append(reports, r.ExecutionReports...)

	// TODO: check outputs for deployed addresses and update dataStore.Addresses()
	// Use data store to track new deployed addresses
	dataStore := ds.NewMemoryDataStore()
	// Keep address book for backward compatibility. TODO remove it once we adopted this version in CLD
	ab, _ := utils.DataStoreToAddressBook(dataStore)

	return cldf.ChangesetOutput{
		MCMSTimelockProposals: r.Output.Proposals,
		DataStore:             dataStore,
		AddressBook:           ab,
		Reports:               reports,
	}, nil
}

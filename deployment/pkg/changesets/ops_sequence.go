package changesets

import (
	"encoding/json"
	"fmt"
	"time"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/mcms"
	mcmston "github.com/smartcontractkit/mcms/sdk/ton"
	"github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

const DefaultTimelockExpirationInHours = 72

var _ cldf.ChangeSetV2[ops.AnySequenceInput] = OpsAnySequence{}

// OpsAnySequence deploys MCMS packages and modules
type OpsAnySequence struct{}

func (cs OpsAnySequence) VerifyPreconditions(_ cldf.Environment, _ ops.AnySequenceInput) error {
	return nil
}

func (cs OpsAnySequence) Apply(env cldf.Environment, in ops.AnySequenceInput) (cldf.ChangesetOutput, error) {
	ctx := env.GetContext()
	selector := types.ChainSelector(in.ChainSelector)

	// Check if any of the inputs requests planning only (this requires MCMS state)
	plannerOptionSet := false
	for _, input := range in.Inputs {
		po, ok := input.(ops.MessagePlannerOption)
		if ok && po.IsPlan() {
			plannerOptionSet = true
			break
		}
	}

	mcmsStates, err := state.LoadMCMSOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load MCMS onchain state: %w", err)
	}
	state, ok := mcmsStates[uint64(selector)]
	if plannerOptionSet && !ok {
		return cldf.ChangesetOutput{}, fmt.Errorf("MCMS required to plan: no MCMS onchain state found for chain selector %d", selector)
	}

	tonChains := env.BlockChains.TonChains()
	chain := tonChains[uint64(selector)]

	// Dependencies currently injected per-operation
	// TODO: generalize dependency injection per-type/s in sequences
	deps := ops.AnySequenceDeps{}
	deps[ops.SendMessages.Def().ID] = ops.SendMessagesDeps{
		Wallet: chain.Wallet,
	}

	reports := make([]operations.Report[any, any], 0)

	// Use data store to track new deployed addresses
	dataStore := ds.NewMemoryDataStore()

	// Execute the (any) sequence based on the provided input
	r, err := operations.ExecuteSequence(env.OperationsBundle, ops.AnySequence, deps, in)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to deploy MCMS for TON chain %d: %w", selector, err)
	}

	reports = append(reports, r.ExecutionReports...)

	// TODO: check outputs for deployed addresses and update dataStore.Addresses()

	// Keep address book for backward compatibility. TODO remove it once we adopted this version in CLD
	ab, _ := utils.DataStoreToAddressBook(dataStore)

	// Return early if no planning requested
	if !plannerOptionSet {
		return cldf.ChangesetOutput{
			MCMSTimelockProposals: []mcms.TimelockProposal{},
			DataStore:             dataStore,
			AddressBook:           ab,
			Reports:               reports,
		}, nil
	}

	batchOp, err := ops.PlansToBatch(selector, r.Output.GetPlans())
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to convert plans to batch operation: %w", err)
	}

	// Inspect the latest MCMS on-chain state to get the current op count
	inspector := mcmston.NewInspector(chain.Client)
	opCount, err := inspector.GetOpCount(ctx, state.MCMS.String())
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to get op count from MCMS state: %w", err)
	}

	// TODO: take from input
	value := tlb.MustFromTON("0.1").Nano().Uint64()
	defaultOpAdditionalFields := json.RawMessage(fmt.Sprintf(`{"value": %d}`, value))

	metadata := types.ChainMetadata{
		StartingOpCount:  uint64(opCount),
		MCMAddress:       state.MCMS.String(),
		AdditionalFields: defaultOpAdditionalFields,
	}

	// TODO: timelock action based on input
	action := types.TimelockActionSchedule

	// TODO: description based on input
	desc := "TODO: add input.Description"

	// Build a proposal
	validUntilMs := uint32(time.Now().Add(time.Duration(DefaultTimelockExpirationInHours) * time.Hour).Unix())
	builder := mcms.NewTimelockProposalBuilder().
		SetVersion("v1").
		SetValidUntil(validUntilMs).
		SetDescription(desc).
		AddTimelockAddress(selector, state.Timelock.String()).
		AddChainMetadata(selector, metadata).
		AddOperation(batchOp).
		SetAction(action)

	// TODO: take from input
	var delay *time.Duration
	_delay := time.Duration(3) * time.Hour
	delay = &_delay
	if delay != nil {
		builder.SetDelay(types.NewDuration(*delay))
	}

	proposal, err := builder.Build()
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to build timelock proposal: %w", err)
	}

	return cldf.ChangesetOutput{
		MCMSTimelockProposals: []mcms.TimelockProposal{*proposal},
		DataStore:             dataStore,
		AddressBook:           ab,
		Reports:               reports,
	}, nil
}

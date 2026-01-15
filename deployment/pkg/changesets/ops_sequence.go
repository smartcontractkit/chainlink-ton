package changesets

import (
	"fmt"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	resolversd "github.com/smartcontractkit/chainlink-ton/deployment/pkg/codec/resolvers"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/resolvers"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

var _ cldf.ChangeSetV2[opsmcms.TimelockAnySequenceInput] = opsAnySequence{}

// opsAnySequence deploys MCMS packages and modules
type opsAnySequence struct {
	rregistry codec.ResolverRegistry
}

func NewOpsAnySequence(registry tvm.ContractTLBRegistry, provider opston.ContractCodeProvider) cldf.ChangeSetV2[opsmcms.TimelockAnySequenceInput] {
	return opsAnySequence{
		rregistry: *codec.NewResolverRegistry(
			codec.NewTypedResolver(resolvers.NewMsgEnvelopeToCellResolver(registry)),
			codec.NewTypedResolver(resolvers.NewContractDataToCellResolver(registry)),
			codec.NewTypedResolver(resolversd.NewContractToCellResolver(provider)),
		),
	}
}

func (cs opsAnySequence) VerifyPreconditions(_ cldf.Environment, _ opsmcms.TimelockAnySequenceInput) error {
	return nil
}

func (cs opsAnySequence) Apply(env cldf.Environment, in opsmcms.TimelockAnySequenceInput) (cldf.ChangesetOutput, error) {
	// Address resolution: load existing MCMS and Timelock addresses if not provided
	mcmsStates, err := state.LoadMCMSOnChainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load MCMS onchain state: %w", err)
	}

	opts := in.Options
	mcmsState, ok := mcmsStates[uint64(opts.ChainSelector)]
	if ok {
		if opts.MCMSAddr == nil {
			opts.MCMSAddr = &mcmsState.MCMS
		}
		if opts.TimelockAddr == nil {
			opts.TimelockAddr = &mcmsState.Timelock
		}
	}

	tonChains := env.BlockChains.TonChains()
	chain := tonChains[uint64(opts.ChainSelector)]

	// Create the dependencies provider - supplies chain and other dependencies to ops/sequences
	dp, err := dep.NewDependencyProvider(dep.Provide(chain))
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
	}

	// Resolve (operation) input values
	//
	// Notice: we try to resolve the the underlying operation inputs using the registered resolvers.
	// For example, this allows resolving extended high-level input (any) before unmarshaling into (raw) op.IN types.
	resolvedInputs, err := cs.rregistry.Resolve(in.AnySequenceIn.Inputs)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to resolve input: %w", err)
	}
	in.AnySequenceIn.Inputs = resolvedInputs.([]any)

	// Execute the (any) sequence based on the provided input
	r, err := operations.ExecuteSequence(env.OperationsBundle, opsmcms.TimelockAnySequence, dp, in)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to deploy MCMS for TON chain %d: %w", opts.ChainSelector, err)
	}

	// TODO (ops/deploy): check outputs for deployed addresses and update dataStore.Addresses()
	// Use data store to track new deployed addresses
	dataStore := ds.NewMemoryDataStore()
	// Keep address book for backward compatibility. TODO remove it once we adopted this version in CLD
	ab, _ := utils.DataStoreToAddressBook(dataStore)

	return cldf.ChangesetOutput{
		MCMSTimelockProposals: r.Output.Proposals,
		DataStore:             dataStore,
		AddressBook:           ab,
		Reports:               r.ExecutionReports,
	}, nil
}

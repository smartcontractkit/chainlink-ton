package changesets

import (
	"fmt"

	cldfds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	ccipdcs "github.com/smartcontractkit/chainlink-ccip/deployment/utils/changesets"
	ccipdmcms "github.com/smartcontractkit/chainlink-ccip/deployment/utils/mcms"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/resolvers"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	resolversd "github.com/smartcontractkit/chainlink-ton/deployment/pkg/codec/resolvers"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opsmcms "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

var _ cldf.ChangeSetV2[OpsAnySequence] = opsAnySequence{}

type OpsAnySequence struct {
	// Together form underlying opsmcms.TimelockAnySequenceInput
	AnySequenceIn opston.AnySequenceInput `json:"anySequenceIn"`
	Options       opsmcms.TimelockOpts    `json:"options"`

	// MCMS input configuration required to create proposals
	MCMS ccipdmcms.Input `json:"mcms"`
}

// opsAnySequence deploys MCMS packages and modules
type opsAnySequence struct {
	rregistry codec.ResolverRegistry
}

func NewOpsAnySequence(registry tvm.ContractTLBRegistry, provider opston.ContractCodeProvider) cldf.ChangeSetV2[OpsAnySequence] {
	return opsAnySequence{
		// Register static resolvers
		rregistry: *codec.NewResolverRegistry(
			codec.NewTypedResolver(resolvers.NewMsgEnvelopeToCellResolver(registry)),
			codec.NewTypedResolver(resolvers.NewContractDataToCellResolver(registry)),
			codec.NewTypedResolver(resolversd.NewContractToCellResolver(provider)),
		),
	}
}

func (cs opsAnySequence) VerifyPreconditions(_ cldf.Environment, _ OpsAnySequence) error {
	return nil
}

func (cs opsAnySequence) Apply(env cldf.Environment, in OpsAnySequence) (cldf.ChangesetOutput, error) {
	selector := in.Options.ChainSelector

	// Register environment-specific resolvers
	cs.rregistry.Register(
		codec.NewTypedResolver(resolversd.NewTonAddrResolver(uint64(selector), env.DataStore)),
	)

	stateCCIP, err := state.LoadOnchainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
	}

	// Address resolution: load existing MCMS and Timelock addresses if not provided
	stateMCMS, err := state.LoadMCMSOnChainState(env)
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to load MCMS onchain state: %w", err)
	}

	chain := env.BlockChains.TonChains()[uint64(selector)]

	// Create the dependencies provider - supplies chain and other dependencies to ops/sequences
	dp, err := dep.NewDependencyProvider(
		dep.Provide(chain),
		dep.Provide(stateCCIP[uint64(selector)]),
		dep.Provide(stateMCMS[uint64(selector)]),
	)
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
	b := env.OperationsBundle
	r, err := cldfops.ExecuteSequence(b, opsmcms.TimelockAnySequence, dp, opsmcms.TimelockAnySequenceInput{
		AnySequenceIn: in.AnySequenceIn,
		Options:       in.Options,
	})
	if err != nil {
		return cldf.ChangesetOutput{}, fmt.Errorf("failed to execute %s on %d: %w", opsmcms.TimelockAnySequence.ID(), selector, err)
	}

	// TODO (ops/deploy): check outputs for deployed addresses and update dataStore.Addresses()
	// Use data store to track new deployed addresses
	dataStore := cldfds.NewMemoryDataStore()

	return ccipdcs.NewOutputBuilder(env, ccipdcs.GetRegistry()).
		WithReports(r.ExecutionReports).
		WithDataStore(dataStore).
		WithBatchOps(r.Output.GetPlans()).
		Build(in.MCMS)
}

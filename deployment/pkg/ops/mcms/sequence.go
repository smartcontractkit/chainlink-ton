package mcms // alias: opsmcms

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/mcms"
	mcmston "github.com/smartcontractkit/mcms/sdk/ton"
	"github.com/smartcontractkit/mcms/types"

	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

var (
	_ opston.Planner[mcms.TimelockProposal] = TimelockAnySequenceOutput{}
)

const (
	DefaultMinDelayHours   = 3
	DefaultValidUntilHours = 72
)

var TimelockAnySequence = operations.NewSequence(
	"ton/sequences/mcms/timelock/any",
	semver.MustParse("0.1.0"),
	"Executes and/or plans (via MCMS/Timelock) a sequence of operations as defined by the inputs",
	timelockAnySeqHandler,
)

type TimelockAnySequenceInput struct {
	AnySequenceIn opston.AnySequenceInput

	ChainSelector types.ChainSelector
	MCMSAddr      *address.Address
	TimelockAddr  *address.Address

	OpsMetadata []types.OperationMetadata

	Description string
	Action      types.TimelockAction
	Value       tlb.Coins
	Delay       *types.Duration
}

type TimelockAnySequenceOutput struct {
	Proposals    []mcms.TimelockProposal
	Transactions []opston.TransactionInfo
}

func (o TimelockAnySequenceOutput) GetPlans() []mcms.TimelockProposal {
	return o.Proposals
}

func timelockAnySeqHandler(b operations.Bundle, deps opston.AnySequenceDeps, in TimelockAnySequenceInput) (TimelockAnySequenceOutput, error) {
	ctx := b.GetContext()

	// Check if any of the inputs requests planning only (this requires MCMS state)
	plannerOptionSet := false
	for _, input := range in.AnySequenceIn.Inputs {
		po, ok := input.(opston.PlannerOption)
		if ok && po.IsPlan() {
			plannerOptionSet = true
			break
		}
	}

	if plannerOptionSet && (in.MCMSAddr == nil || in.TimelockAddr == nil) {
		return TimelockAnySequenceOutput{}, errors.New("MCMS and Timelock addresses are required to plan Timelock proposals")
	}

	// Execute the (any) sequence based on the provided input
	r, err := operations.ExecuteSequence(b, opston.AnySequence, deps, in.AnySequenceIn)
	if err != nil {
		return TimelockAnySequenceOutput{}, fmt.Errorf("failed to execute (underlying) any sequence: %w", err)
	}

	// Return early if no planning requested
	if !plannerOptionSet {
		return TimelockAnySequenceOutput{
			Proposals:    []mcms.TimelockProposal{},
			Transactions: r.Output.Transactions,
		}, nil
	}

	batchOp, err := opston.RawPlansToBatch(in.ChainSelector, r.Output.GetPlans(), in.OpsMetadata)
	if err != nil {
		return TimelockAnySequenceOutput{}, fmt.Errorf("failed to convert plans to batch operation: %w", err)
	}

	chain, ok := deps["chain"].(cldfton.Chain)
	if !ok {
		return TimelockAnySequenceOutput{}, errors.New("missing or invalid TonChain dependency")
	}

	// Inspect the latest MCMS on-chain state to get the current op count
	inspector := mcmston.NewInspector(chain.Client)
	opCount, err := inspector.GetOpCount(ctx, state.MCMS.String())
	if err != nil {
		return TimelockAnySequenceOutput{}, fmt.Errorf("failed to get op count from MCMS state: %w", err)
	}

	value := in.Value.Nano().Uint64()
	metadata := types.ChainMetadata{
		StartingOpCount:  opCount,
		MCMAddress:       in.MCMSAddr.String(),
		AdditionalFields: json.RawMessage(fmt.Sprintf(`{"value": %d}`, value)),
	}

	// Build a proposal
	validUntilMs := uint32(time.Now().Add(time.Duration(DefaultValidUntilHours) * time.Hour).Unix())
	builder := mcms.NewTimelockProposalBuilder().
		SetVersion("v1").
		SetValidUntil(validUntilMs).
		SetDescription(in.Description).
		AddTimelockAddress(in.ChainSelector, in.TimelockAddr.String()).
		AddChainMetadata(in.ChainSelector, metadata).
		AddOperation(batchOp).
		SetAction(in.Action)

	// Set delay if provided, otherwise use default
	delay := types.NewDuration(DefaultMinDelayHours * time.Hour)
	if in.Delay != nil {
		delay = *in.Delay
	}
	builder.SetDelay(delay)

	proposal, err := builder.Build()
	if err != nil {
		return TimelockAnySequenceOutput{}, fmt.Errorf("failed to build timelock proposal: %w", err)
	}

	return TimelockAnySequenceOutput{
		Proposals:    []mcms.TimelockProposal{*proposal},
		Transactions: nil,
	}, nil
}

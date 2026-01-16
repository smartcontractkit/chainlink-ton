package mcms // alias: opsmcms

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/mcms"
	mcmston "github.com/smartcontractkit/mcms/sdk/ton"
	"github.com/smartcontractkit/mcms/types"

	bindmcms "github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/mcms"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
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
	AnySequenceIn opston.AnySequenceInput `json:"anySequenceIn"`
	Options       TimelockOpts            `json:"options"`
}

type TimelockOpts struct {
	ChainSelector types.ChainSelector `json:"chainSelector"`
	MCMSAddr      *address.Address    `json:"mcmsAddr"`
	TimelockAddr  *address.Address    `json:"timelockAddr"`

	OpsMetadata []types.OperationMetadata

	Description string               `json:"description"`
	Action      types.TimelockAction `json:"action"`
	Value       tlb.Coins            `json:"value"`
	Delay       *types.Duration      `json:"delay,omitempty"`
}

type TimelockAnySequenceOutput struct {
	Proposals    []mcms.TimelockProposal
	Transactions []*tlbe.Cell[tlb.Transaction]
}

func (o TimelockAnySequenceOutput) GetPlans() []mcms.TimelockProposal {
	return o.Proposals
}

func timelockAnySeqHandler(b operations.Bundle, dp *dep.DependencyProvider, in TimelockAnySequenceInput) (TimelockAnySequenceOutput, error) {
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

	opts := in.Options
	if plannerOptionSet && (opts.MCMSAddr == nil || opts.TimelockAddr == nil) {
		return TimelockAnySequenceOutput{}, errors.New("MCMS and Timelock addresses are required to plan Timelock proposals")
	}

	// Execute the (any) sequence based on the provided input
	r, err := operations.ExecuteSequence(b, opston.AnySequence, dp, in.AnySequenceIn)
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

	chain, err := dep.Resolve[cldf_ton.Chain](dp)
	if err != nil {
		return TimelockAnySequenceOutput{}, fmt.Errorf("failed to resolve chain dependency: %w", err)
	}

	msgs := opston.AsCells(r.Output.GetPlans())
	batchOp, err := RawPlanCellsToBatch(opts.ChainSelector, msgs, opts.OpsMetadata)
	if err != nil {
		return TimelockAnySequenceOutput{}, fmt.Errorf("failed to convert plans to batch operation: %w", err)
	}

	proposal, err := BuildTimelockProposal(ctx, chain.Client, []types.BatchOperation{batchOp}, opts)
	if err != nil {
		return TimelockAnySequenceOutput{}, fmt.Errorf("failed to build timelock proposal: %w", err)
	}

	return TimelockAnySequenceOutput{
		Proposals:    []mcms.TimelockProposal{proposal},
		Transactions: nil,
	}, nil
}

func BuildTimelockProposal(ctx context.Context, client ton.APIClientWrapped, batchOps []types.BatchOperation, opts TimelockOpts) (mcms.TimelockProposal, error) {
	if len(batchOps) == 0 {
		return mcms.TimelockProposal{}, errors.New("no batch operations provided to build timelock proposal")
	}

	// Inspect the latest MCMS on-chain state to get the current op count
	opCount, err := tvm.CallGetterLatest(ctx, client, opts.MCMSAddr, bindmcms.GetOpCount)
	if err != nil {
		return mcms.TimelockProposal{}, fmt.Errorf("failed to get op count from MCMS state: %w", err)
	}

	value := opts.Value.Nano().Uint64()
	metadata := types.ChainMetadata{
		StartingOpCount:  opCount,
		MCMAddress:       opts.MCMSAddr.String(),
		AdditionalFields: json.RawMessage(fmt.Sprintf(`{"value": %d}`, value)),
	}

	// Build a proposal
	//nolint:gosec // G115: safe to convert to uint32
	validUntilMs := uint32(time.Now().Add(time.Duration(DefaultValidUntilHours) * time.Hour).Unix())
	builder := mcms.NewTimelockProposalBuilder().
		SetVersion("v1").
		SetValidUntil(validUntilMs).
		SetDescription(opts.Description).
		AddTimelockAddress(opts.ChainSelector, opts.TimelockAddr.String()).
		AddChainMetadata(opts.ChainSelector, metadata).
		SetAction(opts.Action)

	// Add all batch operations
	for _, bop := range batchOps {
		builder.AddOperation(bop)
	}

	// Set delay if provided, otherwise use default
	delay := types.NewDuration(DefaultMinDelayHours * time.Hour)
	if opts.Delay != nil {
		delay = *opts.Delay
	}
	builder.SetDelay(delay)

	proposal, err := builder.Build()
	if err != nil {
		return mcms.TimelockProposal{}, fmt.Errorf("failed to build timelock proposal: %w", err)
	}

	return *proposal, nil
}

// RawPlansToBatch converts raw message plans (TON) to MCMS batch operation type.
func RawPlansToBatch(selector types.ChainSelector, plans []opston.MessagePlanRaw, meta []types.OperationMetadata) (types.BatchOperation, error) {
	cells := make([]*tlbe.Cell[tlb.InternalMessage], len(plans))
	for i, p := range plans {
		cells[i] = p.Cell
	}
	return RawPlanCellsToBatch(selector, cells, meta)
}

// RawPlanCellsToBatch converts raw message plan cells (TON) to MCMS batch operation type.
func RawPlanCellsToBatch(selector types.ChainSelector, plans []*tlbe.Cell[tlb.InternalMessage], meta []types.OperationMetadata) (types.BatchOperation, error) {
	mcmsTxs := make([]types.Transaction, len(plans))
	for i, p := range plans {
		body := cell.BeginCell().EndCell() // empty body by default

		msg, err := p.ToValue()
		if err != nil {
			return types.BatchOperation{}, fmt.Errorf("failed to decode internal message from cell for plan %d: %w", i, err)
		}

		if msg.Body != nil {
			body = msg.Body
		}

		// Extract metadata for the transaction
		m := types.OperationMetadata{
			ContractType: "",
			Tags:         []string{},
		}
		if len(meta) > i {
			m = meta[i]
		}

		value := msg.Amount.Nano()
		mcmsTxs[i], err = mcmston.NewTransaction(msg.DstAddr, body.BeginParse(), value, m.ContractType, m.Tags)
		if err != nil {
			return types.BatchOperation{}, fmt.Errorf("failed to create mcms transaction: %w", err)
		}
	}

	return types.BatchOperation{
		ChainSelector: selector,
		Transactions:  mcmsTxs,
	}, nil
}

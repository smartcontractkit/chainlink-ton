package mcms // alias: opsmcms

import (
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	mcmston "github.com/smartcontractkit/mcms/sdk/ton"
	"github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
)

var (
	_ opston.Planner[types.BatchOperation] = TimelockAnySequenceOutput{}
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
	ChainSelector types.ChainSelector       `json:"chainSelector"`
	OpsMetadata   []types.OperationMetadata `json:"opsMetadata"`
}

type TimelockAnySequenceOutput struct {
	BatchOps     []types.BatchOperation
	Transactions []*tlbe.Cell[tlb.Transaction]
}

func (o TimelockAnySequenceOutput) GetPlans() []types.BatchOperation {
	return o.BatchOps
}

func timelockAnySeqHandler(b operations.Bundle, dp *dep.DependencyProvider, in TimelockAnySequenceInput) (TimelockAnySequenceOutput, error) {
	// Execute the (any) sequence based on the provided input
	r, err := operations.ExecuteSequence(b, opston.AnySequence, dp, in.AnySequenceIn)
	if err != nil {
		return TimelockAnySequenceOutput{}, fmt.Errorf("failed to execute (underlying) any sequence: %w", err)
	}

	out := TimelockAnySequenceOutput{
		BatchOps:     []types.BatchOperation{},
		Transactions: r.Output.Transactions,
	}

	plans := r.Output.GetPlans()
	if len(plans) == 0 {
		return out, nil
	}

	msgs := opston.AsCells(plans)
	batchOp, err := RawPlanCellsToBatch(in.Options.ChainSelector, msgs, in.Options.OpsMetadata)
	if err != nil {
		return TimelockAnySequenceOutput{}, fmt.Errorf("failed to convert plans to batch operation: %w", err)
	}

	out.BatchOps = append(out.BatchOps, batchOp)

	return out, nil
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
		body := tvm.EmptyCell // empty body by default

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

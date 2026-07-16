package mcms // alias: opsmcms

import (
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/mcms/types"

	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
)

type Messages struct {
	Messages []*tlbe.Cell[tlb.InternalMessage] `json:"messages"`
	Plans    []*tlbe.Cell[tlb.InternalMessage] `json:"plans"`
	Metadata []OperationMetadata               `json:"metadata"`
}

type SendOrPlanInput struct {
	ChainSelector types.ChainSelector `json:"chainSelector"`

	Messages []*tlbe.Cell[tlb.InternalMessage] `json:"messages"`
	Plans    []*tlbe.Cell[tlb.InternalMessage] `json:"plans"`
	Metadata []OperationMetadata               `json:"metadata"`
}

func NewSendOrPlanInput(chainSelector types.ChainSelector) SendOrPlanInput {
	return SendOrPlanInput{
		ChainSelector: chainSelector,
		Messages:      make([]*tlbe.Cell[tlb.InternalMessage], 0),
		Plans:         make([]*tlbe.Cell[tlb.InternalMessage], 0),
		Metadata:      make([]OperationMetadata, 0),
	}
}

func (in *SendOrPlanInput) Add(msgs []*tlbe.Cell[tlb.InternalMessage], plan bool, meta []OperationMetadata) {
	if plan {
		in.Plans = append(in.Plans, msgs...)
		in.Metadata = append(in.Metadata, meta...)
	} else {
		in.Messages = append(in.Messages, msgs...)
	}
}

var SendOrPlan = cldf_ops.NewOperation(
	"ton/ops/mcms/send-or-plan",
	semver.MustParse("0.1.0"),
	"Sends messages or proposes them as a BatchOperation if the destination is ownable and the sender is not the owner",
	func(b cldf_ops.Bundle, dp *dep.DependencyProvider, in SendOrPlanInput) (sequences.OnChainOutput, error) {
		if len(in.Messages) > 0 {
			_, err := cldf_ops.ExecuteOperation(b, opston.SendMessagesRaw, dp, opston.SendMessagesRawInput{Messages: in.Messages})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to send messages: %w", err)
			}
		}

		out := sequences.OnChainOutput{}

		return WithOperationOutput(out, in.Plans, in.ChainSelector, in.Metadata)
	},
)

// WithOperationOutput is a helper to extract plans from operation output and map them to batch operations.
func WithOperationOutput(out sequences.OnChainOutput, _out any, selector types.ChainSelector, meta []OperationMetadata) (sequences.OnChainOutput, error) {
	// Try to extract the plans and map to batch operation
	if planer, ok := _out.(opston.Planner[opston.MessagePlanRaw]); ok {
		plans := planer.GetPlans()
		plan := len(plans) > 0

		if plan {
			batchOp, err := RawPlansToBatch(selector, plans, meta)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to convert plans to batch operation: %w", err)
			}

			if out.BatchOps == nil {
				out.BatchOps = make([]types.BatchOperation, 0)
			}

			out.BatchOps = append(out.BatchOps, batchOp)
		}

		return out, nil
	}

	if msgs, ok := _out.([]*tlbe.Cell[tlb.InternalMessage]); ok {
		plan := len(msgs) > 0

		if plan {
			batchOp, err := RawPlanCellsToBatch(selector, msgs, meta)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to convert plans to batch operation: %w", err)
			}

			if out.BatchOps == nil {
				out.BatchOps = make([]types.BatchOperation, 0)
			}

			out.BatchOps = append(out.BatchOps, batchOp)
		}

		return out, nil
	}

	return out, nil
}

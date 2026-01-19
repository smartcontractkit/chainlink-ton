package ton // alias: opston

import (
	"fmt"

	"github.com/Masterminds/semver/v3"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

var (
	_ PlannerOption           = SendMessagesInput{}
	_ Planner[MessagePlanRaw] = SendMessagesOutput{}
	_ MessageSender           = SendMessagesOutput{}
)

type SendMessagesInput struct {
	Messages []InternalMessage[any] `json:"messages"`
	Plan     bool                   `json:"plan"`

	// TODO: add WaitTrace option
}

func (in SendMessagesInput) IsPlan() bool {
	return in.Plan
}

type SendMessagesOutput struct {
	Plans       []MessagePlanRaw            `json:"plans"`
	Transaction *tlbe.Cell[tlb.Transaction] `json:"transaction,omitempty"`
	BlockInfo   *ton.BlockIDExt             `json:"blockInfo,omitempty"`
}

func (o SendMessagesOutput) GetPlans() []MessagePlanRaw {
	return o.Plans
}

func (o SendMessagesOutput) GetTransaction() *tlbe.Cell[tlb.Transaction] {
	return o.Transaction
}

var SendMessages = cldf_ops.NewOperation(
	"ton/ops/send-messages",
	semver.MustParse("0.1.0"),
	"Sends and/or plans messages as defined by the inputs",
	func(b cldf_ops.Bundle, dp *dep.DependencyProvider, in SendMessagesInput) (SendMessagesOutput, error) {
		msgs := make([]*tlbe.Cell[tlb.InternalMessage], 0, len(in.Messages))
		plans := make([]MessagePlanRaw, 0, len(in.Messages))

		for _, m := range in.Messages {
			_im, err := m.ToMessage()
			if err != nil {
				return SendMessagesOutput{}, fmt.Errorf("failed to convert internal message to message: %w", err)
			}

			_imc, err := tlbe.NewCellFrom(*_im)
			if err != nil {
				return SendMessagesOutput{}, fmt.Errorf("failed to convert internal message to cell: %w", err)
			}

			opcode, err := tvm.ExtractOpcode(_im.Body)
			if err != nil {
				return SendMessagesOutput{}, fmt.Errorf("failed to extract opcode from message body: %w", err)
			}

			plan := MessagePlanRaw{
				Opcode:  opcode,
				DstAddr: _im.DstAddr,
				Amount:  m.Amount,

				Cell: _imc,
			}
			plans = append(plans, plan)
			msgs = append(msgs, _imc)
		}

		if in.Plan {
			return SendMessagesOutput{Plans: plans}, nil // return early on plan
		}

		out, err := cldf_ops.ExecuteOperation(b, SendMessagesRaw, dp, SendMessagesRawInput{Messages: msgs})
		if err != nil {
			return SendMessagesOutput{}, fmt.Errorf("failed to send messages: %w", err)
		}

		return out.Output, nil
	},
)

type SendMessagesRawInput struct {
	Messages []*tlbe.Cell[tlb.InternalMessage] `json:"messages"`
}

var SendMessagesRaw = cldf_ops.NewOperation(
	"ton/ops/send-messages-raw",
	semver.MustParse("0.1.0"),
	"Sends (raw) messages as defined by the inputs",
	func(b cldf_ops.Bundle, dp *dep.DependencyProvider, in SendMessagesRawInput) (SendMessagesOutput, error) {
		ctx := b.GetContext()

		n := len(in.Messages)
		msgs := make([]*wallet.Message, 0, n)

		for _, m := range in.Messages {
			_im, err := m.ToValue()
			if err != nil {
				return SendMessagesOutput{}, fmt.Errorf("failed to decode internal message from cell: %w", err)
			}

			msgs = append(msgs, &wallet.Message{
				Mode:            wallet.PayGasSeparately | wallet.IgnoreErrors,
				InternalMessage: &_im,
			})
		}

		chain, err := dep.Resolve[cldf_ton.Chain](dp)
		if err != nil {
			return SendMessagesOutput{}, fmt.Errorf("failed to resolve chain: %w", err)
		}

		b.Logger.Infow("Sending messages", "msgs", msgs)

		_tx, block, err := chain.Wallet.SendManyWaitTransaction(ctx, msgs)
		if err != nil {
			return SendMessagesOutput{}, fmt.Errorf("failed to send transaction: %w", err)
		}

		b.Logger.Infow("Transaction sent", "blockID", block, "tx", _tx)

		err = tracetracking.WaitForTrace(ctx, chain.Client, _tx)
		if err != nil {
			return SendMessagesOutput{}, fmt.Errorf("failed to wait for trace: %w", err)
		}

		tx, err := tlbe.NewCellFrom(*_tx)
		if err != nil {
			return SendMessagesOutput{}, fmt.Errorf("failed to convert transaction to cell: %w", err)
		}

		return SendMessagesOutput{
			Transaction: tx,
			BlockInfo:   block,
		}, nil
	},
)

package ton // alias: opston

import (
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

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

type SendMessagesDeps struct {
	Wallet *wallet.Wallet
	Client ton.APIClientWrapped
}

type ProviderDeps struct {
	Client *wallet.Wallet
}

var SendMessages = operations.NewOperation(
	"ton/ops/send-messages",
	semver.MustParse("0.1.0"),
	"Sends and/or plans messages as defined by the inputs",
	func(b operations.Bundle, deps SendMessagesDeps, in SendMessagesInput) (SendMessagesOutput, error) {
		ctx := b.GetContext()

		n := len(in.Messages)
		plans := make([]MessagePlanRaw, 0, n)
		msgs := make([]*wallet.Message, 0, n)

		for _, m := range in.Messages {
			_im, err := m.ToMessage()
			if err != nil {
				return SendMessagesOutput{}, fmt.Errorf("failed to convert internal message to message: %w", err)
			}

			_imc, err := tlbe.NewCellFrom(*_im)
			if err != nil {
				return SendMessagesOutput{}, fmt.Errorf("failed to convert internal message to cell: %w", err)
			}

			plan := MessagePlanRaw{
				Opcode:  0, // TODO: extract opcode from body if possible
				DstAddr: _im.DstAddr,
				Amount:  m.Amount,

				Cell: _imc,
			}
			plans = append(plans, plan)

			msgs = append(msgs, &wallet.Message{
				Mode:            wallet.PayGasSeparately | wallet.IgnoreErrors,
				InternalMessage: _im,
			})
		}

		if in.Plan {
			return SendMessagesOutput{Plans: plans}, nil // return early on plan
		}

		_tx, block, err := deps.Wallet.SendManyWaitTransaction(ctx, msgs)
		if err != nil {
			return SendMessagesOutput{}, fmt.Errorf("failed to send transaction: %w", err)
		}

		err = tracetracking.WaitForTrace(ctx, deps.Client, _tx)
		if err != nil {
			return SendMessagesOutput{}, fmt.Errorf("failed to wait for trace: %w", err)
		}

		tx, err := tlbe.NewCellFrom(*_tx)
		if err != nil {
			return SendMessagesOutput{}, fmt.Errorf("failed to convert transaction to cell: %w", err)
		}

		return SendMessagesOutput{
			Plans:       []MessagePlanRaw{}, // clear plans on send
			Transaction: tx,
			BlockInfo:   block,
		}, nil
	},
)

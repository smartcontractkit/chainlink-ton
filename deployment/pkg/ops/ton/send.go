package ton // alias: opston

import (
	"encoding/hex"
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"

	"github.com/xssnick/tonutils-go/address"
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
	Plans       []MessagePlanRaw `json:"plans"`
	Transaction *TransactionInfo `json:"transaction,omitempty"`
}

func (o SendMessagesOutput) GetPlans() []MessagePlanRaw {
	return o.Plans
}

func (o SendMessagesOutput) GetTransaction() *TransactionInfo {
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
			body, err := m.Body.ToCell() // TODO: body may be nil
			if err != nil {
				return SendMessagesOutput{}, fmt.Errorf("failed to convert message to cell: %w", err)
			}

			// TODO: replace with encoded *tlb.InternalMessage as *cell.Cell
			plan := MessagePlanRaw{
				Body:    body,
				DstAddr: m.DstAddr,
				Amount:  m.Amount,
			}

			if in.Plan {
				plans = append(plans, plan)
				continue
			}

			// StateInit is optional, and will derive dstAddr if available
			dstAddr := m.DstAddr

			var state *tlb.StateInit
			if m.StateInit != nil {
				state = &tlb.StateInit{
					Code: m.StateInit.Code,
					Data: m.StateInit.Data,
				}

				stateCell, err := tlb.ToCell(state)
				if err != nil {
					return SendMessagesOutput{}, fmt.Errorf("failed to convert state init to cell: %w", err)
				}

				wc := int8(0) // TODO: expose option to set workchain (default ok for now)
				dstAddr = address.NewAddress(0, byte(wc), stateCell.Hash())
			}

			msgs = append(msgs, &wallet.Message{
				Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
				InternalMessage: &tlb.InternalMessage{
					IHRDisabled: true,
					Bounce:      m.Bounce, // TODO: default to true
					DstAddr:     dstAddr,
					Amount:      m.Amount,
					Body:        body,
					StateInit:   state,
				},
			})
		}

		if in.Plan {
			return SendMessagesOutput{Plans: plans}, nil // return early
		}

		tx, _, err := deps.Wallet.SendManyWaitTransaction(ctx, msgs)
		if err != nil {
			return SendMessagesOutput{}, fmt.Errorf("failed to send transaction: %w", err)
		}

		err = tracetracking.WaitForTrace(ctx, deps.Client, tx)
		if err != nil {
			return SendMessagesOutput{}, fmt.Errorf("failed to wait for trace: %w", err)
		}

		return SendMessagesOutput{
			Plans: plans,
			Transaction: &TransactionInfo{
				// TODO: AccountAddr
				Hash:        hex.EncodeToString(tx.Hash),
				OutMsgCount: tx.OutMsgCount,
				EndStatus:   tx.EndStatus,
				TotalFees:   tx.TotalFees.Coins,
			},
		}, nil
	},
)

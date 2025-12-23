package ops // alias: opston

import (
	"encoding/hex"
	"fmt"

	"github.com/Masterminds/semver/v3"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
)

var (
	_ MessagePlannerOption = SendMessageInput[any]{}
	_ MessagePlanner       = SendMessageOutput{}
	_ MessageSender        = SendMessageOutput{}
)

type SendMessageInput[T any] struct {
	Envelope codec.MessageEnvelope[T] `json:"envelope"`
	Plan     bool                     `json:"plan"`

	// Tx options
	DstAddr *address.Address `json:"dst_addr"`
	Amount  tlb.Coins        `json:"amount"`
}

func (in SendMessageInput[T]) IsPlan() bool {
	return in.Plan
}

type SendMessageOutput struct {
	Plan        MessagePlanRaw   `json:"plan"`
	Transaction *TransactionInfo `json:"transaction,omitempty"`
}

func (o SendMessageOutput) GetPlan() MessagePlanRaw {
	return o.Plan
}

func (o SendMessageOutput) GetTransaction() *TransactionInfo {
	return o.Transaction
}

type SendMessageDeps struct {
	Wallet *wallet.Wallet
}

func handler[T any](b operations.Bundle, deps SendMessageDeps, in SendMessageInput[T]) (SendMessageOutput, error) {
	ctx := b.GetContext()

	body, err := tlb.ToCell(*in.Envelope.Value)
	if err != nil {
		return SendMessageOutput{}, fmt.Errorf("failed to convert message to cell: %w", err)
	}

	plan := MessagePlanRaw{
		Body:    body,
		DstAddr: in.DstAddr,
		Amount:  in.Amount,
	}

	if in.Plan {
		return SendMessageOutput{
			Plan:        plan,
			Transaction: nil,
		}, nil
	}

	msg := &wallet.Message{
		Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
		InternalMessage: &tlb.InternalMessage{
			IHRDisabled: true,
			Bounce:      true,
			DstAddr:     in.DstAddr,
			Amount:      in.Amount,
			Body:        body,
		},
	}

	tx, _, err := deps.Wallet.SendWaitTransaction(ctx, msg)
	if err != nil {
		return SendMessageOutput{}, fmt.Errorf("failed to send transaction: %w", err)
	}

	return SendMessageOutput{
		Plan: plan,
		Transaction: &TransactionInfo{
			// TODO: AccountAddr
			Hash:        hex.EncodeToString(tx.Hash),
			OutMsgCount: tx.OutMsgCount,
			EndStatus:   tx.EndStatus,
			TotalFees:   tx.TotalFees.Coins,
		},
	}, nil
}

var SendMessage = operations.NewOperation(
	"ton/ops/send-message",
	semver.MustParse("0.1.0"),
	"Sends and/or plans a message as defined by the inputs",
	handler[any],
)

// TODO: add SendManyMessagesOp (check ExecuteTransactions in deployment/ccip/helpers/execute.go)
// TODO: add WaitTrace option

package deployment

import (
	"encoding/hex"
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/debug/lib"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type MessageOpInput[T any] struct {
	Envelope lib.MessageEnvelope[T]
	Plan     bool

	// Tx options
	DstAddr *address.Address
	Amount  tlb.Coins
}

type MessageOpOutput struct {
	Plan        MessagePlanRaw
	Transaction *TransactionInfo
}

type MessagePlanRaw struct {
	Body    *cell.Cell
	DstAddr *address.Address
	Amount  tlb.Coins
}

type TransactionInfo struct {
	AccountAddr *address.Address
	Hash        string
	OutMsgCount uint16
	EndStatus   tlb.AccountStatus
	TotalFees   tlb.Coins
}

type MessageOpDeps struct {
	Wallet *wallet.Wallet
}

func handler[T any](b operations.Bundle, deps MessageOpDeps, in MessageOpInput[T]) (MessageOpOutput, error) {
	ctx := b.GetContext()

	body, err := tlb.ToCell(in.Envelope.Value)
	if err != nil {
		return MessageOpOutput{}, fmt.Errorf("failed to convert message to cell: %w", err)
	}

	plan := MessagePlanRaw{
		Body:    body,
		DstAddr: in.DstAddr,
		Amount:  in.Amount,
	}

	if in.Plan {
		return MessageOpOutput{
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
		return MessageOpOutput{}, fmt.Errorf("failed to send transaction: %w", err)
	}

	return MessageOpOutput{
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

type OpOpts struct {
	Version *semver.Version
	Name    string
	Desc    string
}

func NewMessageOp[T any](opts OpOpts) *operations.Operation[MessageOpInput[T], MessageOpOutput, MessageOpDeps] {
	return operations.NewOperation(opts.Name, opts.Version, opts.Desc, handler[T])
}

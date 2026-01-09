package helpers

import (
	"context"
	"fmt"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

// TODO Remove in favor of ExecuteTransactions.
func ExecuteProposals(env cldf.Environment, client ton.APIClientWrapped, sender *wallet.Wallet, msgs []*tlbe.Cell[*tlb.InternalMessage]) error {
	return ExecuteTransactions(env.GetContext(), env.Logger, client, sender, msgs)
}

func ExecuteTransactions(ctx context.Context, logger logger.Logger, client ton.APIClientWrapped, sender *wallet.Wallet, msgs []*tlbe.Cell[*tlb.InternalMessage]) error {
	if len(msgs) == 0 {
		return nil // nothing to execute
	}

	wmsgs := make([]*wallet.Message, len(msgs))
	for i, msg := range msgs {
		_msg, err := msg.ToValue()
		if err != nil {
			return fmt.Errorf("failed to decode internal message from cell: %w", err)
		}

		wmsgs[i] = &wallet.Message{
			Mode:            wallet.PayGasSeparately | wallet.IgnoreErrors,
			InternalMessage: _msg,
		}
	}

	logger.Infow("Sending msgs", "msgs", msgs)
	tx, blockID, err := sender.SendManyWaitTransaction(ctx, wmsgs)
	logger.Infow("transaction sent", "blockID", blockID, "tx", tx)
	if err != nil {
		return fmt.Errorf("failed to send lane updates: %w", err)
	}

	return tracetracking.WaitForTrace(ctx, client, tx)
}

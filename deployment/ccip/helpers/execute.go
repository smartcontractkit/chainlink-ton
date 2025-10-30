package helpers

import (
	"context"
	"fmt"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

// TODO Remove in favor of ExecuteTransactions.
func ExecuteProposals(env cldf.Environment, client *ton.APIClient, sender *wallet.Wallet, txs [][]byte) error {
	return ExecuteTransactions(env.GetContext(), env.Logger, client, sender, txs)
}

func ExecuteTransactions(context context.Context, logger logger.Logger, client *ton.APIClient, sender *wallet.Wallet, txs [][]byte) error {
	internalMsgs, err := Deserialize(txs)
	if err != nil {
		return fmt.Errorf("failed to deserialize lane updates: %w", err)
	}
	if len(internalMsgs) == 0 {
		// nothing to execute
		return nil
	}
	msgs := make([]*wallet.Message, len(internalMsgs))
	for i, msg := range internalMsgs {
		msgs[i] = &wallet.Message{
			Mode:            wallet.PayGasSeparately | wallet.IgnoreErrors,
			InternalMessage: msg,
		}
	}

	logger.Infow("Sending msgs", "msgs", msgs)
	tx, blockID, err := sender.SendManyWaitTransaction(context, msgs)
	logger.Infow("transaction sent", "blockID", blockID, "tx", tx)
	if err != nil {
		return fmt.Errorf("failed to send lane updates: %w", err)
	}
	msg, err := tracetracking.MapToReceivedMessage(tx)
	if err != nil {
		return fmt.Errorf("failed to get outgoing messages: %w", err)
	}
	err = msg.WaitForTrace(client)
	if err != nil {
		return fmt.Errorf("failed to wait for trace: %w", err)
	}

	if code := msg.OutcomeExitCode(); code != tvm.ExitCodeSuccess {
		return fmt.Errorf("transaction failed with exit code: %d", code)
	}

	return nil
}

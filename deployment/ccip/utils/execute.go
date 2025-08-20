package utils

import (
	"fmt"

	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

func ExecuteProposals(env cldf.Environment, client *ton.APIClient, sender *wallet.Wallet, output [][]byte) error {
	internalMsgs, err := Deserialize(output)
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
			Mode:            wallet.PayGasSeparately, // TODO: wallet.IgnoreErrors ?
			InternalMessage: msg,
		}
	}
	ctx := env.GetContext()
	env.Logger.Infow("Sending msgs", "msgs", msgs)
	tx, blockID, err := sender.SendManyWaitTransaction(ctx, msgs)
	env.Logger.Infow("transaction sent", "blockID", blockID, "tx", tx)
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
	for _, msg := range msg.OutgoingInternalReceivedMessages {
		// check external messages for all marked as Success
		env.Logger.Infow("ReceivedMessage", "msg", msg)
	}
	return nil
}

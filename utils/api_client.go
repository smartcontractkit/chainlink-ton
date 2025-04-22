package utils

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
)

type ApiClient struct {
	Api    ton.APIClientWrapped
	Wallet wallet.Wallet
}

// SendWaitTransaction waits for the transaction to be sent and returns the
// resulting message with the outgoing messages if any.
func SendWaitTransaction(ctx context.Context, ac *ApiClient, messageToSend *wallet.Message, dstAddr address.Address) (*MessageReceived, error) {
	tx, _, err := ac.Wallet.SendWaitTransaction(ctx, messageToSend)
	if err != nil {
		return nil, fmt.Errorf("deposit transaction failed for %s: %w", dstAddr.String(), err)
	}

	receivedMessage, err := MapToReceivedMessage(tx)
	if err != nil {
		return nil, fmt.Errorf("failed to get outgoing messages: %w", err)
	}
	return &receivedMessage, nil
}

// WaitForTrace waits for all outgoing messages to be received and all their
// outgoing messages to be received recursively. It will return the resulting
// message in a Finalized state.
func (m *MessageReceived) WaitForTrace(ac *ApiClient) error {
	if m.Status() == Finalized {
		fmt.Printf("Transaction finalized\n")
		return nil
	}

	messagesWithUnconfirmedOutgoingMessages := NewEmpyQueue[*MessageReceived]()
	messagesWithUnconfirmedOutgoingMessages.Push(m)

	for {
		cascadingMessage, ok := messagesWithUnconfirmedOutgoingMessages.Pop()
		if !ok {
			fmt.Printf("No outgoing messages\n")
			break
		}
		err := cascadingMessage.WaitForOutgoingMessagesToBeReceived(ac)
		if err != nil {
			return fmt.Errorf("failed to wait for outgoing messages: %w", err)
		}
		messagesWithUnconfirmedOutgoingMessages.PushAll(cascadingMessage.OutgoingMessagesReceived)
	}
	return nil
}

// SendWaitTransactionRercursively waits for the transaction to be sent and
// waits for all outgoing messages to be confirmed recursively. It will return
// the resulting message in a Finalized state.
func (ac *ApiClient) SendWaitTransactionRercursively(ctx context.Context, dstAddr address.Address, messageToSend *wallet.Message) (*MessageReceived, error) {
	sentMessage, err := SendWaitTransaction(ctx, ac, messageToSend, dstAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to SendWaitTransaction: %w", err)
	}
	err = sentMessage.WaitForTrace(ac)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for trace: %w", err)
	}
	return sentMessage, nil
}

// SubscribeToTransactions returns a channel with all incoming transactions for
// the given address that came after lt (Lamport Time). It will work
// retroactively, so it will return all transactions that are already in the
// blockchain and all new ones.
func (ac *ApiClient) SubscribeToTransactions(address address.Address, lt uint64) chan *tlb.Transaction {
	transactionsReceived := make(chan *tlb.Transaction)

	// it is a blocking call, so we start it asynchronously
	go ac.Api.SubscribeOnTransactions(context.Background(), &address, lt, transactionsReceived)
	return transactionsReceived
}

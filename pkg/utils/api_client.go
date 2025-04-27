package utils

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type ApiClient struct {
	Api    ton.APIClientWrapped
	Wallet wallet.Wallet
}

// SendWaitTransaction waits for the transaction to be sent and returns the
// resulting message with the outgoing messages if any.
func (ac *ApiClient) SendWaitTransaction(ctx context.Context, dstAddr address.Address, messageToSend *wallet.Message) (*MessageReceived, error) {
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
	sentMessage, err := ac.SendWaitTransaction(ctx, dstAddr, messageToSend)
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

type CompiledContract struct {
	Name string `json:"name"`
	Code string `json:"code"`
	Abi  string `json:"abi"`
}

func (ac *ApiClient) Deploy(contractPath string, initData *cell.Cell) (*Contract, error) {
	compiledContract, err := GetCompiledContract(contractPath)
	if err != nil {
		return nil, fmt.Errorf("Failed to compile contract: %v", err)
	}

	// Extract the Base64-encoded BOC
	codeBoc64 := compiledContract.Code
	if codeBoc64 == "" {
		return nil, fmt.Errorf("codeBoc64 field is empty in the JSON")
	}

	// Decode the Base64 string to get the actual BOC binary
	codeBocBinary, err := base64.StdEncoding.DecodeString(codeBoc64)
	if err != nil {
		return nil, fmt.Errorf("Failed to decode base64: %v", err)
	}

	// Parse the BOC binary into a cell
	codeCell, err := cell.FromBOC(codeBocBinary)
	if err != nil {
		return nil, fmt.Errorf("Failed to parse BOC binary: %v", err)
	}

	// Create empty message body for deployment
	msgBody := cell.BeginCell().EndCell()

	// Deploy the contract
	addr, tx, block, err := ac.Wallet.DeployContractWaitTransaction(
		context.Background(),
		tlb.MustFromTON("0.05"), // Amount to attach to deployment
		msgBody,
		codeCell,
		initData,
	)
	if err != nil {
		return nil, fmt.Errorf("deployment failed: %v", err)
	}

	receivedMessage, err := MapToReceivedMessage(tx)
	if err != nil {
		return nil, fmt.Errorf("failed to get outgoing messages: %w", err)
	}
	err = receivedMessage.WaitForTrace(ac)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for trace: %w", err)
	}
	fmt.Printf("Contract deployed successfully!\n")
	fmt.Printf("Contract address: %s\n", addr.String())
	fmt.Printf("Transaction ID: %s\n", tx)
	fmt.Printf("Block: %s\n", block.RootHash)

	return &Contract{addr, ac}, nil
}

func GetCompiledContract(contractPath string) (CompiledContract, error) {
	// Check if contract file exists
	if _, err := os.Stat(contractPath); os.IsNotExist(err) {
		return CompiledContract{}, fmt.Errorf("Contract file not found: %s", contractPath)
	}
	jsonData, err := os.ReadFile(contractPath)
	if err != nil {
		return CompiledContract{}, fmt.Errorf("Failed to read compiled contract: %v", err)
	}

	// Parse the JSON
	var compiledContract CompiledContract
	err = json.Unmarshal(jsonData, &compiledContract)
	if err != nil {
		return CompiledContract{}, fmt.Errorf("Failed to parse JSON: %v", err)
	}
	return compiledContract, nil

}

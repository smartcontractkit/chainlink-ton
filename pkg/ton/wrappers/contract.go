package wrappers

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/trace_tracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Contract struct {
	Address *address.Address
	Client  *trace_tracking.SignedAPIClient
}

type Message interface {
	OpCode() uint64
	StoreArgs(*cell.Builder) error
}

// Calls a writer message on the contract and waits for it to be received.
// It does not wait for all the trace to be received, only the first message.
// Use CallWaitRecursively to wait for all the trace to be received.
func (c *Contract) CallWait(message Message, amount tlb.Coins) (*trace_tracking.ReceivedMessage, error) {
	b := cell.BeginCell()
	b.StoreUInt(message.OpCode(), 32)
	message.StoreArgs(b)
	body := b.EndCell()
	return c.SendMessageWait(body, amount)
}

// Calls a writer message on the contract and waits for it to be received.
// It waits for all the trace (outgoing messages) to be received.
// Use CallWait to wait onlyfor this first message.
func (c *Contract) CallWaitRecursively(message Message, amount tlb.Coins) (*trace_tracking.ReceivedMessage, error) {
	sentMessage, err := c.CallWait(message, amount)
	if err != nil {
		return nil, fmt.Errorf("failed to send message: %w", err)
	}
	err = sentMessage.WaitForTrace(c.Client)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for trace: %w", err)
	}
	return sentMessage, nil
}

// Calls a writer message on the contract and waits for it to be received.
func (c *Contract) SendMessageWait(body *cell.Cell, amount tlb.Coins) (*trace_tracking.ReceivedMessage, error) {
	m, _, err := c.Client.SendWaitTransaction(context.TODO(),
		*c.Address,
		&wallet.Message{
			Mode: wallet.PayGasSeparately,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      true,
				DstAddr:     c.Address,
				Amount:      amount,
				Body:        body,
			},
		},
	)
	return m, err
}

// Calls a getter method on the contract and waits for it to be received.
func (c *Contract) Get(key string, params ...interface{}) (*ton.ExecutionResult, error) {
	block, err := c.Client.Client.CurrentMasterchainInfo(context.Background())
	if err != nil {
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	return c.Client.Client.WaitForBlock(block.SeqNo).RunGetMethod(context.Background(), block, c.Address, key, params...)
}

func Uint64From(res *ton.ExecutionResult, err error) (uint64, error) {
	if err != nil {
		return 0, fmt.Errorf("failed to run get method: %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return 0, fmt.Errorf("failed to extract value: %w", err)
	}

	return val.Uint64(), nil
}

func Uint32From(res *ton.ExecutionResult, err error) (uint32, error) {
	if err != nil {
		return 0, fmt.Errorf("failed to run get message: %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return 0, fmt.Errorf("failed to extract value: %w", err)
	}

	return uint32(val.Uint64()), nil
}

// SubscribeToMessages returns a channel with all incoming messages for the
// given address that came after lt (Lamport Time). It will work retroactively,
// meaning that it will return all messages that are already in the blockchain
// and all new ones.
func (c *Contract) SubscribeToMessages(lt uint64) chan *trace_tracking.ReceivedMessage {
	messagesReceived := make(chan *trace_tracking.ReceivedMessage)
	go func() {
		transactionsReceived := c.Client.SubscribeToTransactions(*c.Address, lt)

		for rTX := range transactionsReceived {
			if rTX.IO.In != nil {
				var err error
				receivedMessage, err := trace_tracking.MapToReceivedMessage(rTX)
				if err != nil {
				}
				messagesReceived <- &receivedMessage
			}
		}
	}()
	return messagesReceived
}

type tactCompiledContract struct {
	Name string `json:"name"`
	Code string `json:"code"`
	Abi  string `json:"abi"`
}

type tolkCompiledContract struct {
	Hash       string `json:"hash"`
	HashBase64 string `json:"hashBase64"`
	Hex        string `json:"hex"`
}

func (c tactCompiledContract) codeCell() (*cell.Cell, error) {
	// Extract the Base64-encoded BOC
	codeBoc64 := c.Code
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
	return codeCell, nil
}

func (c tolkCompiledContract) codeCell() (*cell.Cell, error) {
	// Extract the Hex-encoded BOC
	codeBocHex := c.Hex
	if codeBocHex == "" {
		return nil, fmt.Errorf("codeBocHex field is empty in the JSON")
	}

	// Decode the Hex string to get the actual BOC binary
	codeBocBytes, err := hex.DecodeString(codeBocHex)
	if err != nil {
		return nil, fmt.Errorf("Failed to decode hex: %v", err)
	}

	// Parse the BOC binary into a cell
	codeCell, err := cell.FromBOC(codeBocBytes)
	if err != nil {
		return nil, fmt.Errorf("Failed to parse BOC binary: %v", err)
	}
	return codeCell, nil
}

// Deploy deploys a contract to the blockchain. It takes the code cell of a
// compiled contract, the initial data for the contract, and the amount of
// TON to be sent to the contract upon deployment.
// It returns the contract wrapper if the deployment is successful.
// The function returns an error if the deployment fails.
func Deploy(client *trace_tracking.SignedAPIClient, codeCell *cell.Cell, initData *cell.Cell, amount tlb.Coins) (*Contract, error) {
	// Create empty message body for deployment
	msgBody := cell.BeginCell().EndCell()

	// Deploy the contract
	addr, tx, _, err := client.Wallet.DeployContractWaitTransaction(
		context.Background(),
		amount,
		msgBody,
		codeCell,
		initData,
	)
	if err != nil {
		return nil, fmt.Errorf("deployment failed: %v", err)
	}

	receivedMessage, err := trace_tracking.MapToReceivedMessage(tx)
	if err != nil {
		return nil, fmt.Errorf("failed to get outgoing messages: %w", err)
	}
	err = receivedMessage.WaitForTrace(client)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for trace: %w", err)
	}
	if receivedMessage.ExitCode != tvm.ExitCode_Success || len(receivedMessage.OutgoingInternalReceivedMessages) != 1 {
		return nil, fmt.Errorf("contract deployment failed: error sending external message: exit code %d: %s", receivedMessage.ExitCode, receivedMessage.ExitCode.Describe())

	}
	deployExitCode := receivedMessage.OutgoingInternalReceivedMessages[0].ExitCode
	if !deployExitCode.IsSuccessfulDeployment() {
		return nil, fmt.Errorf("contract deployment failed: exit code %d: %s", deployExitCode, deployExitCode.Describe())
	}

	return &Contract{addr, client}, nil
}

func ParseCompiledContract(path string) (*cell.Cell, error) {
	// Check if contract file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil, fmt.Errorf("Contract file not found: %s", path)
	}
	jsonData, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("Failed to read compiled contract: %v", err)
	}

	if strings.HasSuffix(path, ".pkg") {
		// Parse the JSON
		compiledContract := &tactCompiledContract{}
		err = json.Unmarshal(jsonData, &compiledContract)
		if err != nil {
			return nil, fmt.Errorf("Failed to parse JSON: %v", err)
		}
		return compiledContract.codeCell()
	} else if strings.HasSuffix(path, ".compiled.json") {
		// Parse the JSON
		compiledContract := &tolkCompiledContract{}
		err = json.Unmarshal(jsonData, &compiledContract)
		if err != nil {
			return nil, fmt.Errorf("Failed to parse JSON: %v", err)
		}
		return compiledContract.codeCell()
	} else {
		return nil, fmt.Errorf("Unsupported contract file format: %s", path)
	}
}

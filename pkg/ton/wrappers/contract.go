package wrappers

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type Contract struct {
	Address *address.Address
	Client  *tracetracking.SignedAPIClient
}

// Calls a writer message on the contract and waits for it to be received.
// It does not wait for all the trace to be received, only the first message.
// Use CallWaitRecursively to wait for all the trace to be received.
// Message must implement github.com/xssnick/tonutils-go/tlb.Marshaller or provide tlb tags
func (c *Contract) CallWait(message any, amount tlb.Coins) (*tracetracking.ReceivedMessage, error) {
	body, err := tlb.ToCell(message)
	if err != nil {
		return nil, fmt.Errorf("failed to store message args: %w", err)
	}
	return c.SendMessageWait(body, amount)
}

// Calls a writer message on the contract and waits for it to be received.
// It waits for all the trace (outgoing messages) to be received.
// Use CallWait to wait only for this first message.
func (c *Contract) CallWaitRecursively(message any, amount tlb.Coins) (*tracetracking.ReceivedMessage, error) {
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
func (c *Contract) SendMessageWait(body *cell.Cell, amount tlb.Coins) (*tracetracking.ReceivedMessage, error) {
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

	u64 := val.Uint64()
	if u64 > uint64(^uint32(0)) {
		return 0, fmt.Errorf("value %d overflows uint32", u64)
	}
	return uint32(u64), nil
}

// SubscribeToMessages returns a channel with all incoming messages for the
// given address that came after lt (Lamport Time). It will work retroactively,
// meaning that it will return all messages that are already in the blockchain
// and all new ones.
func (c *Contract) SubscribeToMessages(lt uint64) chan *tracetracking.ReceivedMessage {
	messagesReceived := make(chan *tracetracking.ReceivedMessage)
	go func() {
		transactionsReceived := c.Client.SubscribeToTransactions(*c.Address, lt)

		for rTX := range transactionsReceived {
			if rTX.IO.In != nil {
				var err error
				receivedMessage, err := tracetracking.MapToReceivedMessage(rTX)
				if err != nil {
					fmt.Printf("failed to map received message: %v\n", err)
					continue
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
	Hex string `json:"hex"`
}

func (c tactCompiledContract) codeCell() (*cell.Cell, error) {
	// Extract the Base64-encoded BOC
	codeBoc64 := c.Code
	if codeBoc64 == "" {
		return nil, errors.New("codeBoc64 field is empty in the JSON")
	}

	// Decode the Base64 string to get the actual BOC binary
	codeBocBinary, err := base64.StdEncoding.DecodeString(codeBoc64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %w", err)
	}

	// Parse the BOC binary into a cell
	codeCell, err := cell.FromBOC(codeBocBinary)
	if err != nil {
		return nil, fmt.Errorf("failed to parse BOC binary: %w", err)
	}
	return codeCell, nil
}

func (c tolkCompiledContract) codeCell() (*cell.Cell, error) {
	// Extract the Hex-encoded BOC
	codeBocHex := c.Hex
	if codeBocHex == "" {
		return nil, errors.New("codeBocHex field is empty in the JSON")
	}

	// Decode the Hex string to get the actual BOC binary
	codeBocBytes, err := hex.DecodeString(codeBocHex)
	if err != nil {
		return nil, fmt.Errorf("failed to decode hex: %w", err)
	}

	// Parse the BOC binary into a cell
	codeCell, err := cell.FromBOC(codeBocBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse BOC binary: %w", err)
	}
	return codeCell, nil
}

// Deploy deploys a contract to the blockchain. It takes the code cell of a
// compiled contract, the initial data for the contract, and the amount of
// TON to be sent to the contract upon deployment.
// It returns the contract wrapper if the deployment is successful.
// The function does not check the exit code of the deployment transaction as
// the exit code depends on the contract implementation. This is left to the
// caller. Example:
//
// ```
//
// msg, err := tlb.ToCell(jetton_wrappers.TopUpMessage{QueryID: rand.Uint64()})
//
// require.NoError(t, err, "failed to create top-up message")
//
// receiverJettonWallet, deployMsg, err := wrappers.Deploy(&setup.common.receiver, jettonWalletCode, jettonWalletInitCell, tlb.MustFromTON("0.1"),
// //msg)
// require.NoError(t, err, "failed to deploy JettonWallet contract")
//
// deployExitCode := deployMsg.OutgoingInternalReceivedMessages[0].ExitCode
//
// require.Zero(t, deployExitCode, "contract deployment failed: exit code %d: %s", deployExitCode, deployExitCode.Describe())
//
// ```
func Deploy(client *tracetracking.SignedAPIClient, codeCell *cell.Cell, initData *cell.Cell, amount tlb.Coins, msgBody *cell.Cell) (*Contract, *tracetracking.ReceivedMessage, error) {
	// Deploy the contract
	addr, tx, _, err := client.Wallet.DeployContractWaitTransaction(
		context.Background(),
		amount,
		msgBody,
		codeCell,
		initData,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("deployment failed: %w", err)
	}

	receivedMessage, err := tracetracking.MapToReceivedMessage(tx)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get outgoing messages: %w", err)
	}
	err = receivedMessage.WaitForTrace(client)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to wait for trace: %w", err)
	}
	if receivedMessage.ExitCode != tvm.ExitCodeSuccess || len(receivedMessage.OutgoingInternalReceivedMessages) != 1 {
		return nil, nil, fmt.Errorf("contract deployment failed: error sending external message: exit code %d: %s", receivedMessage.ExitCode, receivedMessage.ExitCode.Describe())
	}

	return &Contract{addr, client}, &receivedMessage, nil
}

func Open(client *tracetracking.SignedAPIClient, codeCell *cell.Cell, initData *cell.Cell) (*Contract, error) {
	state := &tlb.StateInit{
		Data: initData,
		Code: codeCell,
	}

	stateCell, err := tlb.ToCell(state)
	if err != nil {
		return nil, err
	}

	addr := address.NewAddress(0, byte(0), stateCell.Hash())

	return &Contract{
		Address: addr,
		Client:  client,
	}, nil
}

func ParseCompiledContract(path string) (*cell.Cell, error) {
	// Check if contract file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil, fmt.Errorf("contract file not found: %s", path)
	}
	jsonData, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read compiled contract: %w", err)
	}

	switch {
	case strings.HasSuffix(path, ".pkg"):
		// Parse the JSON
		compiledContract := &tactCompiledContract{}
		err = json.Unmarshal(jsonData, &compiledContract)
		if err != nil {
			return nil, fmt.Errorf("failed to parse JSON: %w", err)
		}
		return compiledContract.codeCell()
	case strings.HasSuffix(path, ".compiled.json"):
		// Parse the JSON
		compiledContract := &tolkCompiledContract{}
		err = json.Unmarshal(jsonData, &compiledContract)
		if err != nil {
			return nil, fmt.Errorf("failed to parse JSON: %w", err)
		}
		return compiledContract.codeCell()
	default:
		return nil, fmt.Errorf("unsupported contract file format: %s", path)
	}
}

package wrappers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/boc"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
)

type Contract struct {
	Address *address.Address
	Client  *tracetracking.SignedAPIClient
}

// CallWait sends message to the contract and waits for the wallet transaction
// carrying it. It does not wait for the rest of the trace; use
// CallWaitRecursively for that.
// The message must implement tlb.Marshaller or provide tlb tags.
func (c *Contract) CallWait(ctx context.Context, message any, amount tlb.Coins) (*tracetracking.ReceivedMessage, error) {
	body, err := tlb.ToCell(message)
	if err != nil {
		return nil, fmt.Errorf("failed to store message args: %w", err)
	}
	return c.SendMessageWait(ctx, body, amount)
}

// CallWaitRecursively sends message to the contract and waits for its whole
// trace, including all outgoing messages.
func (c *Contract) CallWaitRecursively(ctx context.Context, message any, amount tlb.Coins) (*tracetracking.ReceivedMessage, error) {
	sentMessage, err := c.CallWait(ctx, message, amount)
	if err != nil {
		return nil, fmt.Errorf("failed to send message: %w", err)
	}
	err = sentMessage.WaitForTrace(ctx, c.Client.Client)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for trace: %w", err)
	}
	return sentMessage, nil
}

// SendMessageWait sends body to the contract and waits for the wallet
// transaction carrying it.
func (c *Contract) SendMessageWait(ctx context.Context, body *cell.Cell, amount tlb.Coins) (*tracetracking.ReceivedMessage, error) {
	m, _, err := c.Client.SendWaitTransaction(ctx,
		*c.Address,
		&wallet.Message{
			Mode: wallet.PayGasSeparately | wallet.IgnoreErrors,
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

type tactCompiledContract struct {
	Name string `json:"name"`
	Code string `json:"code"`
	Abi  string `json:"abi"`
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

// Deploy deploys a contract to the blockchain. It takes the code cell of a
// compiled contract, the initial data for the contract, and the amount of
// TON to be sent to the contract upon deployment.
// It returns the contract wrapper if the deployment is successful.
// The deploy transaction must complete with a success exit code.
func Deploy(ctx context.Context, client *tracetracking.SignedAPIClient, codeCell *cell.Cell, initData *cell.Cell, amount tlb.Coins, msgBody *cell.Cell) (*Contract, *tracetracking.ReceivedMessage, error) {
	addr, receivedMessage, err := client.DeployAndWaitForTrace(ctx, codeCell, initData, amount, msgBody)
	if err != nil {
		return nil, nil, err
	}
	return &Contract{addr, client}, receivedMessage, nil
}

// DeployActivateOnly deploys a contract and requires only that its account
// becomes active. The deploy transaction exit code is left to the caller,
// which is useful for legacy contracts that activate but reject the
// deployment message.
func DeployActivateOnly(ctx context.Context, client *tracetracking.SignedAPIClient, codeCell *cell.Cell, initData *cell.Cell, amount tlb.Coins, msgBody *cell.Cell) (*Contract, *tracetracking.ReceivedMessage, error) {
	addr, receivedMessage, err := client.DeployActivateOnlyAndWaitForTrace(ctx, codeCell, initData, amount, msgBody)
	if err != nil {
		return nil, nil, err
	}
	return &Contract{addr, client}, receivedMessage, nil
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
		return ParseCompiledTactContractFromFileBytes(jsonData)
	case strings.HasSuffix(path, ".compiled.json"):
		return boc.ParseTolkCompiledContract(jsonData)
	default:
		return nil, fmt.Errorf("unsupported contract file format: %s", path)
	}
}

func ParseCompiledTactContractFromFileBytes(data []byte) (*cell.Cell, error) {
	// Parse the JSON
	compiledContract := &tactCompiledContract{}
	err := json.Unmarshal(data, compiledContract)
	if err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}
	return compiledContract.codeCell()
}

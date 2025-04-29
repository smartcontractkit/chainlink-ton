package utils

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Contract struct {
	Address   *address.Address
	ApiClient *ApiClient
}

type Method interface {
	OpCode() uint64
	StoreArgs(*cell.Builder) error
}

// Calls a writer method on the contract and waits for it to be received.
// It does not wait for all the trace to be received, only the first message.
// Use CallWaitRecursively to wait for all the trace to be received.
func (c *Contract) CallWait(method Method, queryId uint64) (*MessageReceived, error) {
	b := cell.BeginCell()
	b.StoreUInt(method.OpCode(), 32)
	b.StoreUInt(queryId, 64)
	method.StoreArgs(b)
	body := b.EndCell()
	return c.SendMessageWait(body)
}

func (c *Contract) CallWaitRecursively(method Method, queryId uint64) (*MessageReceived, error) {
	sentMessage, err := c.CallWait(method, queryId)
	if err != nil {
		return nil, fmt.Errorf("failed to send message: %w", err)
	}
	err = sentMessage.WaitForTrace(c.ApiClient)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for trace: %w", err)
	}
	return sentMessage, nil
}

func (c *Contract) SendMessageWait(body *cell.Cell) (*MessageReceived, error) {
	return c.ApiClient.SendWaitTransaction(context.TODO(),
		*c.Address,
		&wallet.Message{
			Mode: wallet.PayGasSeparately,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      true,
				DstAddr:     c.Address,
				Amount:      tlb.MustFromTON("0.1"),
				Body:        body,
			},
		},
	)
}

func (c *Contract) Get(key string) (*ton.ExecutionResult, error) {
	block, err := c.ApiClient.Api.CurrentMasterchainInfo(context.Background())
	if err != nil {
		return nil, fmt.Errorf("failed to get current block: %w", err)
	}

	return c.ApiClient.Api.WaitForBlock(block.SeqNo).RunGetMethod(context.Background(), block, c.Address, key)
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
		return 0, fmt.Errorf("failed to run get method: %w", err)
	}

	val, err := res.Int(0)
	if err != nil {
		return 0, fmt.Errorf("failed to extract value: %w", err)
	}

	return uint32(val.Uint64()), nil
}

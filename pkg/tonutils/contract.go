package tonutils

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
	Address *address.Address
	Client  *SignedAPIClient
}

type Method interface {
	OpCode() uint64
	StoreArgs(*cell.Builder) error
}

// Calls a writer method on the contract and waits for it to be received.
// It does not wait for all the trace to be received, only the first message.
// Use CallWaitRecursively to wait for all the trace to be received.
func (c *Contract) CallWait(method Method, amount tlb.Coins) (*ReceivedMessage, error) {
	b := cell.BeginCell()
	b.StoreUInt(method.OpCode(), 32)
	method.StoreArgs(b)
	body := b.EndCell()
	return c.SendMessageWait(body, amount)
}

// Calls a writer method on the contract and waits for it to be received.
// It waits for all the trace (outgoing messages) to be received.
// Use CallWait to wait onlyfor this first message.
func (c *Contract) CallWaitRecursively(method Method, amount tlb.Coins) (*ReceivedMessage, error) {
	sentMessage, err := c.CallWait(method, amount)
	if err != nil {
		return nil, fmt.Errorf("failed to send message: %w", err)
	}
	err = sentMessage.WaitForTrace(c.Client)
	if err != nil {
		return nil, fmt.Errorf("failed to wait for trace: %w", err)
	}
	return sentMessage, nil
}

// Calls a writer method on the contract and waits for it to be received.
func (c *Contract) SendMessageWait(body *cell.Cell, amount tlb.Coins) (*ReceivedMessage, error) {
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
		return 0, fmt.Errorf("failed to run get method: %w", err)
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
func (c *Contract) SubscribeToMessages(lt uint64) chan *ReceivedMessage {
	messagesReceived := make(chan *ReceivedMessage)
	go func() {
		transactionsReceived := c.Client.SubscribeToTransactions(*c.Address, lt)

		for rTX := range transactionsReceived {
			if rTX.IO.In != nil {
				var err error
				receivedMessage, err := MapToReceivedMessage(rTX)
				if err != nil {
				}
				messagesReceived <- &receivedMessage
			}
		}
	}()
	return messagesReceived
}

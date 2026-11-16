// Package tracetest provides an in-memory chain to exercise trace tracking without a TON node.
package tracetest

import (
	"context"
	"math/big"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// Chain is a ton.APIClientWrapped whose SubscribeOnTransactions replays the transactions recorded
// with Receive. A message without a recorded transaction is never received, as with a recipient
// that never completes its part of the trace. Other APIClientWrapped methods are not implemented.
//
// Logical times follow TON: a transaction takes the next logical time, and the messages it sends
// are created after it.
type Chain struct {
	ton.APIClientWrapped

	t  *testing.T
	mu sync.Mutex
	lt uint64
	// transactions by the address of the account that executed them
	txs map[string][]*tlb.Transaction
	// addresses SubscribeOnTransactions was called for, in call order
	subscribed []string
}

func NewChain(t *testing.T) *Chain {
	return &Chain{t: t, lt: 1000, txs: map[string][]*tlb.Transaction{}}
}

// Out describes a message sent by a transaction.
type Out struct {
	Dst     *address.Address
	Body    *cell.Cell
	Bounced bool // the message is a bounce of the message the transaction handled
}

// Tx is a recorded transaction and the messages it sent, in Out order.
type Tx struct {
	*tlb.Transaction
	Out []*tlb.InternalMessage
}

// Addr returns a distinct basechain address for n.
func Addr(n byte) *address.Address {
	data := make([]byte, 32)
	data[31] = n
	return address.NewAddress(0, 0, data)
}

// Body returns a message body starting with opcode.
func Body(opcode uint64) *cell.Cell {
	return cell.BeginCell().MustStoreUInt(opcode, 32).EndCell()
}

// Send returns a message from src to dst sent by a transaction outside the recorded chain, such as
// the message that starts a trace.
func (c *Chain) Send(src, dst *address.Address, body *cell.Cell) *tlb.InternalMessage {
	c.mu.Lock()
	defer c.mu.Unlock()
	return newMessage(src, Out{Dst: dst, Body: body}, c.nextLT())
}

// Receive records the successful transaction of in's recipient handling in and sending outs.
func (c *Chain) Receive(in *tlb.InternalMessage, outs ...Out) Tx {
	return c.ReceiveWithExitCode(0, in, outs...)
}

// ReceiveWithExitCode records the transaction of in's recipient handling in with exitCode and
// sending outs.
func (c *Chain) ReceiveWithExitCode(exitCode int32, in *tlb.InternalMessage, outs ...Out) Tx {
	c.mu.Lock()
	defer c.mu.Unlock()

	tx := &tlb.Transaction{
		AccountAddr: in.DstAddr.Data(),
		LT:          c.nextLT(),
		OutMsgCount: uint16(len(outs)), //nolint:gosec // test sizes
		OrigStatus:  tlb.AccountStatusActive,
		EndStatus:   tlb.AccountStatusActive,
		TotalFees:   tlb.CurrencyCollection{Coins: tlb.ZeroCoins},
		Description: tlb.TransactionDescriptionOrdinary{
			ComputePhase: tlb.ComputePhase{Phase: tlb.ComputePhaseVM{
				Success: exitCode == 0,
				GasFees: tlb.ZeroCoins,
				Details: tlb.ComputePhaseVMDetails{ExitCode: exitCode},
			}},
		},
	}
	tx.IO.In = &tlb.Message{MsgType: tlb.MsgTypeInternal, Msg: in}

	sent := make([]*tlb.InternalMessage, 0, len(outs))
	if len(outs) > 0 {
		list := cell.NewDict(15)
		for i, out := range outs {
			msg := newMessage(in.DstAddr, out, c.nextLT())
			msgCell, err := (&tlb.Message{MsgType: tlb.MsgTypeInternal, Msg: msg}).ToCell()
			require.NoError(c.t, err)
			require.NoError(c.t, list.SetIntKey(big.NewInt(int64(i)), cell.BeginCell().MustStoreRef(msgCell).EndCell()))
			sent = append(sent, msg)
		}
		tx.IO.Out = &tlb.MessagesList{List: list}
	}

	key := in.DstAddr.String()
	c.txs[key] = append(c.txs[key], tx)
	return Tx{Transaction: tx, Out: sent}
}

// Subscribed returns the addresses SubscribeOnTransactions was called for, in call order.
func (c *Chain) Subscribed() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.subscribed...)
}

func (c *Chain) SubscribeOnTransactions(ctx context.Context, addr *address.Address, lastProcessedLT uint64, channel chan<- *tlb.Transaction) {
	defer close(channel)

	c.mu.Lock()
	c.subscribed = append(c.subscribed, addr.String())
	txs := append([]*tlb.Transaction(nil), c.txs[addr.String()]...)
	c.mu.Unlock()

	for _, tx := range txs {
		if tx.LT <= lastProcessedLT {
			continue
		}
		select {
		case channel <- tx:
		case <-ctx.Done():
			return
		}
	}
	<-ctx.Done()
}

// nextLT advances the chain's logical time. The caller holds c.mu.
func (c *Chain) nextLT() uint64 {
	c.lt++
	return c.lt
}

func newMessage(src *address.Address, out Out, createdLT uint64) *tlb.InternalMessage {
	return &tlb.InternalMessage{
		IHRDisabled: true,
		Bounce:      !out.Bounced,
		Bounced:     out.Bounced,
		SrcAddr:     src,
		DstAddr:     out.Dst,
		Amount:      tlb.MustFromTON("0.1"),
		IHRFee:      tlb.ZeroCoins,
		FwdFee:      tlb.FromNanoTONU(1000),
		CreatedLT:   createdLT,
		Body:        out.Body,
	}
}

// Package tracetest provides an in-memory chain to exercise trace tracking without a TON node.
package tracetest

import (
	"bytes"
	"cmp"
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"math/big"
	"slices"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tl"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// Chain is a ton.APIClientWrapped holding the transactions recorded with Receive in blocks of a
// single basechain shard. It serves the block queries trace tracking uses: looking up a block by
// logical time, reading its header, listing its transactions and getting one of them. A message
// without a recorded transaction is never received, as with a recipient that never completes its
// part of the trace. Other APIClientWrapped methods are not implemented.
//
// Logical times follow TON: a transaction takes the next logical time, and the messages it sends
// are created after it. Account state is not modelled: blocks hold the transactions of any address.
type Chain struct {
	ton.APIClientWrapped

	t      *testing.T
	mu     sync.Mutex
	lt     uint64
	blocks []*block
	open   *block // the block Receive records into, if any
	// addresses whose transactions were searched for, in search order
	searched []string
	// sequence numbers of the blocks whose transactions were listed, in listing order
	searchedBlocks []uint32
}

type block struct {
	id      *ton.BlockIDExt
	startLT uint64
	endLT   uint64 // 0 while the block is open
	txs     []*tlb.Transaction
}

// shard is the shard of every block of a Chain: the whole basechain.
const shard = math.MinInt64 // 0x8000000000000000

func NewChain(t *testing.T) *Chain {
	return &Chain{t: t, lt: 1000}
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

// OpenBlock starts a block that the following transactions are recorded into, until CloseBlock.
// Outside of it, each transaction is recorded into a block of its own.
func (c *Chain) OpenBlock() {
	c.mu.Lock()
	defer c.mu.Unlock()
	require.Nil(c.t, c.open, "a block is already open")
	c.open = c.newBlock()
}

// CloseBlock ends the block started by OpenBlock.
func (c *Chain) CloseBlock() {
	c.mu.Lock()
	defer c.mu.Unlock()
	require.NotNil(c.t, c.open, "no block is open")
	c.closeBlock(c.open)
	c.open = nil
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

	blk := c.open
	if blk == nil {
		blk = c.newBlock()
		defer c.closeBlock(blk)
	}

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

	blk.txs = append(blk.txs, tx)
	return Tx{Transaction: tx, Out: sent}
}

// Searched returns the addresses whose transactions were searched for, in search order, with
// repetitions.
func (c *Chain) Searched() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.searched...)
}

// SearchedBlocks returns the sequence numbers of the blocks whose transactions were listed, in
// listing order, with a repetition for each further page of a block.
func (c *Chain) SearchedBlocks() []uint32 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return slices.Clone(c.searchedBlocks)
}

func (c *Chain) Client() ton.LiteClient {
	return liteClient{c}
}

func (c *Chain) GetBlockHeader(_ context.Context, id *ton.BlockIDExt) (*tlb.BlockHeader, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	blk, err := c.block(id)
	if err != nil {
		return nil, err
	}
	header := &tlb.BlockHeader{}
	header.SeqNo = blk.id.SeqNo
	header.StartLt = blk.startLT
	header.EndLt = blk.endLT
	return header, nil
}

func (c *Chain) GetBlockTransactionsV2(_ context.Context, id *ton.BlockIDExt, count uint32, after ...*ton.TransactionID3) ([]ton.TransactionShortInfo, bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	blk, err := c.block(id)
	if err != nil {
		return nil, false, err
	}
	c.searchedBlocks = append(c.searchedBlocks, blk.id.SeqNo)

	var from *ton.TransactionID3
	if len(after) > 0 && after[0] != nil {
		from = after[0]
		c.searched = append(c.searched, address.NewAddress(0, 0, from.Account).String())
	}

	// Liteservers list a block's transactions ordered by account and then logical time.
	txs := slices.Clone(blk.txs)
	slices.SortFunc(txs, func(a, b *tlb.Transaction) int {
		if byAccount := bytes.Compare(a.AccountAddr, b.AccountAddr); byAccount != 0 {
			return byAccount
		}
		return cmp.Compare(a.LT, b.LT)
	})

	var listed []ton.TransactionShortInfo
	for _, tx := range txs {
		if from != nil {
			byAccount := bytes.Compare(tx.AccountAddr, from.Account)
			if byAccount < 0 || (byAccount == 0 && tx.LT <= from.LT) {
				continue
			}
		}
		if uint32(len(listed)) == count { //nolint:gosec // test sizes
			return listed, true, nil
		}
		listed = append(listed, ton.TransactionShortInfo{Account: tx.AccountAddr, LT: tx.LT, Hash: tx.Hash})
	}
	return listed, false, nil
}

func (c *Chain) GetTransaction(_ context.Context, id *ton.BlockIDExt, addr *address.Address, lt uint64) (*tlb.Transaction, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	blk, err := c.block(id)
	if err != nil {
		return nil, err
	}
	for _, tx := range blk.txs {
		if tx.LT == lt && bytes.Equal(tx.AccountAddr, addr.Data()) {
			return tx, nil
		}
	}
	return nil, fmt.Errorf("transaction %d of %s not in block %d", lt, addr, id.SeqNo)
}

// lookupBlockByLT returns the first block ending at or after lt, as liteservers do.
func (c *Chain) lookupBlockByLT(lt uint64) (*ton.BlockIDExt, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, blk := range c.blocks {
		if blk.endLT != 0 && blk.endLT >= lt {
			return blk.id, true
		}
	}
	return nil, false
}

// block returns the recorded block id refers to. The caller holds c.mu.
func (c *Chain) block(id *ton.BlockIDExt) (*block, error) {
	for _, blk := range c.blocks {
		if blk.id.Equals(id) {
			return blk, nil
		}
	}
	return nil, fmt.Errorf("block %d not found", id.SeqNo)
}

// newBlock starts a block. The caller holds c.mu.
func (c *Chain) newBlock() *block {
	seqNo := uint32(len(c.blocks) + 1) //nolint:gosec // test sizes
	hash := make([]byte, 32)
	binary.BigEndian.PutUint32(hash, seqNo)
	blk := &block{
		id:      &ton.BlockIDExt{Workchain: 0, Shard: shard, SeqNo: seqNo, RootHash: hash, FileHash: hash},
		startLT: c.nextLT(),
	}
	c.blocks = append(c.blocks, blk)
	return blk
}

// closeBlock ends blk after the logical times its transactions used. The caller holds c.mu.
func (c *Chain) closeBlock(blk *block) {
	blk.endLT = c.nextLT()
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

// liteClient answers the raw liteserver queries trace tracking makes: block lookups by logical time.
type liteClient struct {
	c *Chain
}

func (l liteClient) QueryLiteserver(_ context.Context, payload tl.Serializable, result tl.Serializable) error {
	query, ok := payload.(ton.LookupBlock)
	if !ok || query.Mode != 2 {
		return fmt.Errorf("unsupported query %T", payload)
	}
	resp, ok := result.(*tl.Serializable)
	if !ok {
		return fmt.Errorf("unsupported result %T", result)
	}

	if id, found := l.c.lookupBlockByLT(query.LT); found {
		*resp = ton.BlockHeader{ID: id}
	} else {
		*resp = ton.LSError{Code: 651, Text: "block not found"}
	}
	return nil
}

func (l liteClient) StickyContext(ctx context.Context) context.Context { return ctx }

func (l liteClient) StickyContextNextNode(ctx context.Context) (context.Context, error) {
	return ctx, nil
}

func (l liteClient) StickyContextNextNodeBalanced(ctx context.Context) (context.Context, error) {
	return ctx, nil
}

func (l liteClient) StickyNodeID(context.Context) uint32 { return 0 }

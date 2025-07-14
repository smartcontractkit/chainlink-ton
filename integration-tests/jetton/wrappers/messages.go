package wrappers

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type ForwardPayload interface {
	Store(b *cell.Builder) error
}

type transferMessage struct {
	queryID             uint64
	jettonAmount        *big.Int
	destination         *address.Address
	responseDestination *address.Address
	customPayload       *cell.Cell
	forwardTonAmount    *big.Int
	forwardPayload      ForwardPayload
}

type cellForwardPayload struct{ payload *cell.Cell }

type sliceForwardPayload struct{ payload *cell.Slice }

func NewForwardPayload[T *cell.Cell | *cell.Slice](payload T) ForwardPayload {
	switch p := any(payload).(type) {
	case *cell.Cell:
		return &cellForwardPayload{payload: p}
	case *cell.Slice:
		return &sliceForwardPayload{payload: p}
	default:
		return nil
	}
}

func (c *sliceForwardPayload) Store(b *cell.Builder) error {
	err := b.StoreBoolBit(false)
	if err != nil {
		return fmt.Errorf("failed to store bool bit: %w", err)
	}
	err = b.StoreBuilder(c.payload.ToBuilder())
	if err != nil {
		return fmt.Errorf("failed to store payload: %w", err)
	}
	return nil
}

func (c *cellForwardPayload) Store(b *cell.Builder) error {
	err := b.StoreBoolBit(true)
	if err != nil {
		return fmt.Errorf("failed to store bool bit: %w", err)
	}
	err = b.StoreRef(c.payload)
	if err != nil {
		return fmt.Errorf("failed to store payload: %w", err)
	}
	return nil
}

type jettonInternalTransfer struct {
	queryId          uint64
	amount           *big.Int
	from             *address.Address
	responseAddress  *address.Address
	forwardTonAmount *big.Int
	forwardPayload   ForwardPayload
}

func (jettonInternalTransfer) OpCode() uint64 {
	return 0x178d4519
}

func (t jettonInternalTransfer) Store(b *cell.Builder) error {
	err := b.StoreUInt(t.OpCode(), 32)
	if err != nil {
		return fmt.Errorf("failed to store opcode: %w", err)
	}

	err = b.StoreUInt(t.queryId, 64)
	if err != nil {
		return fmt.Errorf("failed to store query_id: %w", err)
	}

	err = b.StoreBigCoins(t.amount)
	if err != nil {
		return fmt.Errorf("failed to store amount: %w", err)
	}
	err = b.StoreAddr(t.from)
	if err != nil {
		return fmt.Errorf("failed to store from: %w", err)
	}
	err = b.StoreAddr(t.responseAddress)
	if err != nil {
		return fmt.Errorf("failed to store responseAddress: %w", err)
	}
	err = b.StoreBigCoins(t.forwardTonAmount)
	if err != nil {
		return fmt.Errorf("failed to store forwardTonAmount: %w", err)
	}
	err = t.forwardPayload.Store(b)
	if err != nil {
		return fmt.Errorf("failed to store forwardPayload: %w", err)
	}
	return nil
}

type mintMessage struct {
	queryID     uint64
	destination *address.Address
	tonAmount   *big.Int
	masterMsg   jettonInternalTransfer
	// tonAmount       *big.Int
	// customPayload *cell.Cell
}

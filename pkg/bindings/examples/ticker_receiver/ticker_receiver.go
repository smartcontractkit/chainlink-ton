package ticker_receiver

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type Storage struct {
	ID            uint32                   `tlb:"## 32"`
	Router        *address.Address         `tlb:"addr"`
	AllowedSender common.CrossChainAddress `tlb:"^"`
}

type Tick struct {
	_       tlb.Magic `tlb:"#d4834e00" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID uint64    `tlb:"## 64"`
	Times   uint32    `tlb:"## 32"` // Number of ticks to perform before stopping.
}

type TickRec struct {
	_       tlb.Magic `tlb:"#46033C09" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID uint64    `tlb:"## 64"`
	ExecID  *big.Int  `tlb:"## 192"`
	Times   uint32    `tlb:"## 32"` // Number of ticks to perform before stopping.
}

var TLBs = tvm.MustNewTLBMap([]any{
	Tick{},
	TickRec{},
}).MustWithStorageType(Storage{})

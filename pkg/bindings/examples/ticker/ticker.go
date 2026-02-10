package ticker

import (
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

type Storage struct {
	ID uint32 `tlb:"## 32"`
}

type Tick struct {
	_       tlb.Magic `tlb:"#d4834e00" json:"-"` //nolint:revive // Ignore opcode tag
	QueryID uint64    `tlb:"## 64"`
	Times   uint32    `tlb:"## 32"` // Number of ticks to perform before stopping.
}

var TLBs = tvm.MustNewTLBMap([]any{
	Tick{},
}).MustWithStorageType(Storage{})

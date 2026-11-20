package counter

import (
	"fmt"
	"math"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/hash"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

type ContractData struct {
	ID    uint32 `tlb:"## 32"`
	Value uint32 `tlb:"## 32"`

	Ownable ownable2step.Storage `tlb:"."`
}

// Message to set the counter value.
type SetCount struct {
	_        tlb.Magic `tlb:"#00000004" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID  uint64    `tlb:"## 64"`
	NewCount uint32    `tlb:"## 32"`
}

// Message to increase the counter value.
type IncreaseCount struct {
	_       tlb.Magic `tlb:"#10000005" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	QueryID uint64    `tlb:"## 64"`
}

// Events

var TopicCountSet uint32 = hash.CRC32("CountSet")
var TopicCountIncreased uint32 = hash.CRC32("CountIncreased")

type CountSet struct {
	ID     uint32           `tlb:"## 32"`
	Value  uint32           `tlb:"## 32"`
	Sender *address.Address `tlb:"addr"`
}

type CountIncreased struct {
	ID     uint32           `tlb:"## 32"`
	Value  uint32           `tlb:"## 32"`
	Sender *address.Address `tlb:"addr"`
}

// Reply message to sender when the counter is set.
type CountSetMsg struct {
	_      tlb.Magic        `tlb:"#f3a02426" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	ID     uint32           `tlb:"## 32"`
	Value  uint32           `tlb:"## 32"`
	Sender *address.Address `tlb:"addr"`
}

// Reply message to sender when the counter is increased.
type CountIncreasedMsg struct {
	_      tlb.Magic        `tlb:"#41c92746" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	ID     uint32           `tlb:"## 32"`
	Value  uint32           `tlb:"## 32"`
	Sender *address.Address `tlb:"addr"`
}

// Getters

// GetValue reads the current counter value.
var GetValue = tvm.NewNoArgsGetter(tvm.NoArgsOpts[uint32]{
	Name:    "value",
	Decoder: tvm.NewResultDecoder(decodeUint32),
})

// GetID reads the counter ID.
var GetID = tvm.NewNoArgsGetter(tvm.NoArgsOpts[uint32]{
	Name:    "id",
	Decoder: tvm.NewResultDecoder(decodeUint32),
})

func decodeUint32(r *ton.ExecutionResult) (uint32, error) {
	val, err := r.Int(0)
	if err != nil {
		return 0, fmt.Errorf("failed to extract value: %w", err)
	}
	if !val.IsUint64() || val.Uint64() > math.MaxUint32 {
		return 0, fmt.Errorf("value %s overflows uint32", val)
	}
	return uint32(val.Uint64()), nil
}

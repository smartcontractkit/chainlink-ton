package counter

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type ContractData struct {
	ID    uint32 `tlb:"## 32"`
	Value uint32 `tlb:"## 32"`

	// TODO: import as ownable2step.Data bindings from pkg/bindings/lib/access/ownable_2step
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
	ID     uint32          `tlb:"## 32"`
	Value  uint32          `tlb:"## 32"`
	Sender address.Address `tlb:"addr"`
}

type CountIncreased struct {
	ID     uint32          `tlb:"## 32"`
	Value  uint32          `tlb:"## 32"`
	Sender address.Address `tlb:"addr"`
}

// Reply message to sender when the counter is set.
type CountSetMsg struct {
	_      tlb.Magic       `tlb:"#0xf3a02426" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	ID     uint32          `tlb:"## 32"`
	Value  uint32          `tlb:"## 32"`
	Sender address.Address `tlb:"addr"`
}

// Reply message to sender when the counter is increased.
type CountIncreasedMsg struct {
	_      tlb.Magic       `tlb:"#0x41c92746" json:"-"` //nolint:revive // (opcode) should stay uninitialized
	ID     uint32          `tlb:"## 32"`
	Value  uint32          `tlb:"## 32"`
	Sender address.Address `tlb:"addr"`
}

// Getters

func GetValue(ctx context.Context, api ton.APIClientWrapped, addr *address.Address) (uint32, error) {
	block, err := api.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, fmt.Errorf("CurrentMasterchainInfo err: %w", err)
	}

	return wrappers.Uint32From(api.WaitForBlock(block.SeqNo).RunGetMethod(ctx, block, addr, "value"))
}

func GetID(ctx context.Context, api ton.APIClientWrapped, addr *address.Address) (uint32, error) {
	block, err := api.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, fmt.Errorf("CurrentMasterchainInfo err: %w", err)
	}

	return wrappers.Uint32From(api.WaitForBlock(block.SeqNo).RunGetMethod(ctx, block, addr, "id"))
}

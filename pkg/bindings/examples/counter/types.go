package counter

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/hash"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type ContractData struct {
	ID    uint32 `tlb:"## 32"`
	Value uint32 `tlb:"## 32"`

	// TODO: import as ownable2step.Data bindings from pkg/bindings/lib/access/ownable_2step
	Ownable common.Ownable2Step `tlb:"."`
}

// Message to set the counter value.
type SetCount struct {
	_        tlb.Magic `tlb:"#00000004"` //nolint:revive // opcode magic
	QueryID  uint64    `tlb:"## 64"`
	NewCount uint32    `tlb:"## 32"`
}

// Message to increase the counter value.
type IncreaseCount struct {
	_       tlb.Magic `tlb:"#10000005"` //nolint:revive // opcode magic
	QueryID uint64    `tlb:"## 64"`
}

// Events

var TopicCountSet uint32 = hash.CRC32("CountSet")
var TopicCountIncreased uint32 = hash.CRC32("CountIncreased")

type CountSet struct {
	ID    uint32 `tlb:"## 32"`
	Value uint32 `tlb:"## 32"`
}

type CountIncreased struct {
	ID    uint32 `tlb:"## 32"`
	Value uint32 `tlb:"## 32"`
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

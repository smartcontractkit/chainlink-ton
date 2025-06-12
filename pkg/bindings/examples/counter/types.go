package counter

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
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

func (m SetCount) OpCode() uint32 {
	return 0x00000004
}

// TODO: should be replaced with tlb tags and tlb.ToCell, only here as tracetracking util requirement (for now)
func (m SetCount) StoreArgs(b *cell.Builder) error {
	c, err := tlb.ToCell(m)
	if err != nil {
		return fmt.Errorf("failed to convert SetCount to cell: %w", err)
	}

	// TODO: fix HACK - standardise go bindings and tlb serialization/deserialization
	s := c.BeginParse()
	_, _ = s.LoadUInt(32) // skip serializing opcode as tracetracking pkg will add (duplicate) it

	if err := b.StoreBuilder(s.ToBuilder()); err != nil {
		return fmt.Errorf("failed to store SetCount args: %w", err)
	}
	return nil
}

// Message to increase the counter value.
type IncreaseCount struct {
	_       tlb.Magic `tlb:"#10000005"` //nolint:revive // opcode magic
	QueryID uint64    `tlb:"## 64"`
}

func (m IncreaseCount) OpCode() uint32 {
	return 0x10000005
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

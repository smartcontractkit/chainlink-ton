package router

import (
	"context"
	"fmt"
	"math/big"
	"runtime"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

const (
	OpcodeSetRamps = 0x10000001
	OpcodeCCIPSend = 0x00000001
)

const (
	ErrorDestChainNotEnabled tvm.ExitCode = tvm.ExitCode(0x1001)
	ErrorUnknownMessage      tvm.ExitCode = tvm.ExitCode(0x1002)
)

const onRampGetter = "onRamp"

type Storage struct {
	ID      uint32              `tlb:"## 32"`
	Ownable common.Ownable2Step `tlb:"."`
	OnRamps *cell.Dictionary    `tlb:"dict 64"`
}

// DestChainSelector is a wrapper uint64 to support SnakeData encoding.
type DestChainSelector struct {
	Value uint64 `tlb:"## 64"`
}

type SetRamps struct {
	_                  tlb.Magic                           `tlb:"#10000001"` //nolint:revive // Ignore opcode tag
	QueryID            uint64                              `tlb:"## 64"`
	DestChainSelectors common.SnakeData[DestChainSelector] `tlb:"^"`
	OnRamps            *address.Address                    `tlb:"addr"`
}

// TokenAmount is a structure that holds the amount and token address for a CCIP transaction.
type TokenAmount struct {
	Amount *big.Int        `tlb:"## 256"`
	Token  address.Address `tlb:"addr"`
}

type CCIPSend struct {
	_                 tlb.Magic                    `tlb:"#00000001"` //nolint:revive // Ignore opcode tag
	QueryID           uint64                       `tlb:"## 64"`
	DestChainSelector uint64                       `tlb:"## 64"`
	Receiver          common.CrossChainAddress     `tlb:"."`
	Data              common.SnakeBytes            `tlb:"^"`
	TokenAmounts      common.SnakeRef[TokenAmount] `tlb:"^"`
	FeeToken          *address.Address             `tlb:"addr"`
	ExtraArgs         *cell.Cell                   `tlb:"^"`
}

// FetchOnRampAddresses retrieves the on-ramp addresses for all destination chains from the router contract.
func FetchOnRampAddresses(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, routerAddr *address.Address) (map[uint64]*address.Address, error) {
	result, err := client.RunGetMethod(ctx, block, routerAddr, common.DestChainsGetter)
	if err != nil {
		return nil, err
	}

	selectorSlice := common.ParseExecutionResultForDestChainSelectors(result.AsTuple())

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	onRampAddrMap := make(map[uint64]*address.Address)
	for _, dest := range selectorSlice {
		eg.Go(func() error {
			result, err := client.RunGetMethod(egCtx, block, routerAddr, onRampGetter, dest) // New variables per goroutine
			if err != nil {
				return fmt.Errorf("error getting onrampAddr: %v", err)
			}

			var onRampSlice *cell.Slice
			var onRampAddr *address.Address
			onRampSlice, err = result.Slice(0)
			if err != nil {
				return err
			}

			onRampAddr, err = onRampSlice.LoadAddr()
			if err != nil {
				return fmt.Errorf("failed to load onramp address: %w", err)
			}

			lock.Lock()
			onRampAddrMap[dest] = onRampAddr
			lock.Unlock()
			return nil
		})
	}

	return onRampAddrMap, eg.Wait()
}

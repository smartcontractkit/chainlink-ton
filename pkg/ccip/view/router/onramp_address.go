package router

import (
	"context"
	"fmt"
	"runtime"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"
)

const (
	destChainsGetter = "destChainSelectors"
	onRampGetter     = "onRamp"
)

// OnRampAddressMap represents a map of destination chain selectors to their on-ramp addresses.
// This type aligns with the on-chain data structure for on-ramp address mappings.
type OnRampAddressMap map[uint64]*address.Address

// Fetch retrieves all on-ramp addresses for destination chains from the router contract.
func (o *OnRampAddressMap) Fetch(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, routerAddr *address.Address) error {
	result, err := client.RunGetMethod(ctx, block, routerAddr, destChainsGetter)
	if err != nil {
		return err
	}

	selectorSlice := parser.ParseLispTuple(result.AsTuple())

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	onRampAddrMap := make(OnRampAddressMap)
	for _, dest := range selectorSlice {
		eg.Go(func() error {
			res, e := client.RunGetMethod(egCtx, block, routerAddr, onRampGetter, dest)
			if e != nil {
				return fmt.Errorf("error getting onrampAddr: %w", e)
			}

			onRampSlice, e := res.Slice(0)
			if e != nil {
				return e
			}

			onRampAddr, e := onRampSlice.LoadAddr()
			if e != nil {
				return fmt.Errorf("failed to load onramp address: %w", e)
			}

			lock.Lock()
			onRampAddrMap[dest] = onRampAddr
			lock.Unlock()
			return nil
		})
	}

	if err = eg.Wait(); err != nil {
		return err
	}

	*o = onRampAddrMap
	return nil
}

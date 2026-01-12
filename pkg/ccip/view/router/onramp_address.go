package router

import (
	"context"
	"runtime"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// OnRampAddressMap represents a map of destination chain selectors to their on-ramp addresses.
// This type aligns with the on-chain data structure for on-ramp address mappings.
type OnRampAddressMap map[uint64]*address.Address

// Fetch retrieves all on-ramp addresses for destination chains from the router contract.
func (o *OnRampAddressMap) Fetch(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, routerAddr *address.Address) error {
	selectorSlice, err := tvm.CallGetter(ctx, client, block, routerAddr, router.GetDestChainSelectors)
	if err != nil {
		return err
	}

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	onRampAddrMap := make(OnRampAddressMap)
	for _, dest := range selectorSlice {
		eg.Go(func() error {
			onRampAddr, cErr := tvm.CallGetter(egCtx, client, block, routerAddr, router.GetOnRamp, dest)
			if cErr != nil {
				return cErr
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

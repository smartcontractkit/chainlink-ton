package onramp

import (
	"context"
	"runtime"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

// DestChainConfigMap represents a map of destination chain selectors to their configurations.
// This type aligns with the on-chain data structure for destination chain configs.
type DestChainConfigMap map[uint64]onramp.DestChainConfig

// Fetch retrieves all destination chain configurations from the on-ramp contract.
func (d *DestChainConfigMap) Fetch(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, onRampAddr *address.Address) error {
	chainSelectors, err := tvm.CallGetter(ctx, client, block, onRampAddr, onramp.GetDestChainSelectors)
	if err != nil {
		return err
	}

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	output := make(DestChainConfigMap)
	for _, dest := range chainSelectors {
		eg.Go(func() error {
			cfg, cErr := tvm.CallGetter(egCtx, client, block, onRampAddr, onramp.GetDestChainConfig, dest)
			if cErr != nil {
				return cErr
			}

			lock.Lock()
			output[dest] = cfg
			lock.Unlock()

			return nil
		})
	}

	if err = eg.Wait(); err != nil {
		return err
	}

	*d = output
	return nil
}

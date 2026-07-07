package offramp

import (
	"context"
	"runtime"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
)

// SourceChainConfigMap represents a map of source chain selectors to their configurations.
// This type aligns with the on-chain data structure for source chain configs.
type SourceChainConfigMap map[uint64]offramp.SourceChainConfig

// Fetch retrieves all source chain configurations from the off-ramp contract.
func (s *SourceChainConfigMap) Fetch(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, offRampAddr *address.Address) error {
	chainSelectors, err := tvm.CallGetter(ctx, client, block, offRampAddr, offramp.GetSourceChainSelectors)
	if err != nil {
		return err
	}

	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	var lock sync.Mutex
	output := make(SourceChainConfigMap)

	for _, dest := range chainSelectors {
		eg.Go(func() error {
			cfg, cErr := tvm.CallGetter(egCtx, client, block, offRampAddr, offramp.GetSourceChainConfig, dest)
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

	*s = output
	return nil
}

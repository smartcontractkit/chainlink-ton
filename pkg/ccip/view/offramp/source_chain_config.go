package offramp

import (
	"context"
	"runtime"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

const sourceChainsGetter = "sourceChainSelectors"

// SourceChainConfigMap represents a map of source chain selectors to their configurations.
// This type aligns with the on-chain data structure for source chain configs.
type SourceChainConfigMap map[uint64]offramp.SourceChainConfig

// Fetch retrieves all source chain configurations from the off-ramp contract.
func (s *SourceChainConfigMap) Fetch(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, offRampAddr *address.Address) error {
	result, err := client.RunGetMethod(ctx, block, offRampAddr, sourceChainsGetter)
	if err != nil {
		return err
	}

	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	var lock sync.Mutex
	output := make(SourceChainConfigMap)
	chainSelectors := parser.ParseLispTuple(result.AsTuple())

	for _, dest := range chainSelectors {
		eg.Go(func() error {
			var cfg offramp.SourceChainConfig
			opts := []interface{}{dest}
			if err = tvm.FetchResult(egCtx, client, block, offRampAddr, &cfg, opts); err != nil {
				return err
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

package onramp

import (
	"context"
	"runtime"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

const destChainsGetter = "destChainSelectors"

// DestChainConfigMap represents a map of destination chain selectors to their configurations.
// This type aligns with the on-chain data structure for destination chain configs.
type DestChainConfigMap map[uint64]onramp.DestChainConfig

// Fetch retrieves all destination chain configurations from the on-ramp contract.
func (d *DestChainConfigMap) Fetch(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, onRampAddr *address.Address) error {
	result, err := client.RunGetMethod(ctx, block, onRampAddr, destChainsGetter)
	if err != nil {
		return err
	}

	chainSelectors := parser.ParseLispTuple(result.AsTuple())

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	output := make(DestChainConfigMap)
	for _, dest := range chainSelectors {
		eg.Go(func() error {
			var cfg onramp.DestChainConfig
			opts := []interface{}{dest}
			if err = tvm.FetchResult(egCtx, client, block, onRampAddr, &cfg, opts); err != nil {
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

	*d = output
	return nil
}

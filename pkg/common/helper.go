package common

import (
	"math/big"
	"runtime"
	"sync"

	ccipcommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/net/context"
	"golang.org/x/sync/errgroup"
)

// FetchOnRampDestChainConfig retrieves destination chain configurations from the on-ramp contract.
func FetchOnRampDestChainConfig(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, onRampAddr *address.Address) (map[uint64]onramp.DestChainConfig, error) {
	result, err := client.RunGetMethod(ctx, block, onRampAddr, ccipcommon.DestChainsGetter)
	if err != nil {
		return nil, err
	}

	chainSelectors := ParseExecutionResultForDestChainSelectors(result.AsTuple())

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	output := make(map[uint64]onramp.DestChainConfig)
	for _, dest := range chainSelectors {
		eg.Go(func() error {
			var cfg onramp.DestChainConfig
			opts := []interface{}{dest}
			if err = cfg.FetchResult(egCtx, client, block, onRampAddr, opts); err != nil {
				return err
			}

			lock.Lock()
			output[dest] = cfg
			lock.Unlock()

			return nil
		})
	}

	return output, eg.Wait()
}

// ParseExecutionResultForDestChainSelectors parses the result of a get method call that returns a Lisp-style list of uint64 selectors.
func ParseExecutionResultForDestChainSelectors(tuple []any) []uint64 {
	if len(tuple) == 0 {
		return nil
	}

	var result []uint64
	// The first element is the lisp list contains [big.Int, [big.Int, [...]]]
	rawList := tuple[0]
	lispList, ok := rawList.([]any)
	if !ok || lispList == nil {
		return result
	}

	var bi *big.Int
	var next []any
	for len(lispList) == 2 {
		if bi, ok = lispList[0].(*big.Int); ok {
			result = append(result, bi.Uint64())
		}
		if next, ok = lispList[1].([]any); !ok || next == nil {
			break
		}
		lispList = next
	}
	return result
}

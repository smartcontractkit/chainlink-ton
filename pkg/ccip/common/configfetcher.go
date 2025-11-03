package configfetcher

import (
	"fmt"
	"runtime"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"golang.org/x/net/context"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

const (
	SourceChainsGetter = "sourceChainSelectors"
	DestChainsGetter   = "destChainSelectors"
	OnRampGetter       = "onRamp"
)

// ConfigFetcher is an interface for fetching and parsing contract configurations.
type ConfigFetcher interface {
	// FetchResult fetches the configuration from the contract at the specified block and address.
	FetchResult(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddr *address.Address, opts []interface{}) error
	// FromResult parses the configuration from the execution result.
	FromResult(result *ton.ExecutionResult) error
}

// FetchOnRampDestChainConfig retrieves destination chain configurations from the on-ramp contract.
func FetchOnRampDestChainConfig(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, onRampAddr *address.Address) (map[uint64]onramp.DestChainConfig, error) {
	result, err := client.RunGetMethod(ctx, block, onRampAddr, DestChainsGetter)
	if err != nil {
		return nil, err
	}

	chainSelectors := parser.ParseLispTuple(result.AsTuple())

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

// FetchFeeQuoterDestChainConfigs fetches all destination chain configurations from the fee quoter contract
func FetchFeeQuoterDestChainConfigs(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, feeQuoter *address.Address) (map[uint64]feequoter.DestChainConfig, error) {
	result, err := client.RunGetMethod(ctx, block, feeQuoter, DestChainsGetter)
	if err != nil {
		return nil, err
	}

	selectorSlice := parser.ParseLispTuple(result.AsTuple())
	eg, egCtx := errgroup.WithContext(ctx)

	var lock sync.Mutex
	eg.SetLimit(runtime.NumCPU())
	output := make(map[uint64]feequoter.DestChainConfig)
	for _, dest := range selectorSlice {
		eg.Go(func() error {
			var cfg feequoter.DestChainConfig
			opts := []interface{}{dest}
			if err = cfg.FetchResult(egCtx, client, block, feeQuoter, opts); err != nil {
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

// FetchOffRampSrcChainConfig retrieves source chain configurations from the off-ramp contract.
func FetchOffRampSrcChainConfig(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, offRampAddr *address.Address) (map[uint64]offramp.SourceChainConfig, error) {
	result, err := client.RunGetMethod(ctx, block, offRampAddr, SourceChainsGetter)
	if err != nil {
		return nil, err
	}

	var eg errgroup.Group
	eg.SetLimit(runtime.NumCPU())
	var lock sync.Mutex
	output := make(map[uint64]offramp.SourceChainConfig)
	chainSelectors := parser.ParseLispTuple(result.AsTuple())

	for _, dest := range chainSelectors {
		eg.Go(func() error {
			var cfg offramp.SourceChainConfig
			opts := []interface{}{dest}
			if err = cfg.FetchResult(ctx, client, block, offRampAddr, opts); err != nil {
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

// FetchRouterOnRampAddresses retrieves the on-ramp addresses for all destination chains from the router contract.
func FetchRouterOnRampAddresses(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, routerAddr *address.Address) (map[uint64]*address.Address, error) {
	result, err := client.RunGetMethod(ctx, block, routerAddr, DestChainsGetter)
	if err != nil {
		return nil, err
	}

	selectorSlice := parser.ParseLispTuple(result.AsTuple())

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	onRampAddrMap := make(map[uint64]*address.Address)
	for _, dest := range selectorSlice {
		eg.Go(func() error {
			result, err := client.RunGetMethod(egCtx, block, routerAddr, OnRampGetter, dest) // New variables per goroutine
			if err != nil {
				return fmt.Errorf("error getting onrampAddr: %w", err)
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

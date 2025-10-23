package feequoter

import (
	"context"
	"fmt"
	"runtime"
	"sync"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
)

const (
	staticConfigGetter = "staticConfig"
)

// View represents a view of the fee quoter contract configuration.
type View struct {
	view.MetaData
	StaticConfig    feequoter.StaticConfig               `json:"staticConfig"`
	DestChainConfig map[uint64]feequoter.DestChainConfig `json:"destChainConfig,omitempty"`
}

// FetchView generates a view of the fee quoter contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, feeQuoter *address.Address) (*View, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, feeQuoter, view.VersionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %w", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, feeQuoter, staticConfigGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %w", err)
	}

	var sc feequoter.StaticConfig
	if err = sc.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse StaticConfig: %w", err)
	}

	destConfigs, err := fetchDestChainConfigsView(ctx, c, block, feeQuoter)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch dest chain config view: %w", err)
	}

	return &View{
		MetaData: view.MetaData{
			Address:      feeQuoter,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		StaticConfig:    sc,
		DestChainConfig: destConfigs,
	}, nil
}

func fetchDestChainConfigsView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, feeQuoter *address.Address) (map[uint64]feequoter.DestChainConfig, error) {
	result, err := c.Client.RunGetMethod(ctx, block, feeQuoter, view.DestChainsGetter)
	if err != nil {
		return nil, err
	}

	selectorSlice := view.ParseExecutionResultForDestChainSelectors(result.AsTuple())
	eg, egCtx := errgroup.WithContext(ctx)

	var lock sync.Mutex
	eg.SetLimit(runtime.NumCPU())
	output := make(map[uint64]feequoter.DestChainConfig)
	for _, dest := range selectorSlice {
		eg.Go(func() error {
			result, err = c.Client.RunGetMethod(egCtx, block, feeQuoter, view.DestChainConfigGetter, dest) // New variables per goroutine
			if err != nil {
				return err
			}
			var cfg feequoter.DestChainConfig
			if err = cfg.FromResult(result); err != nil {
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

package onramp

import (
	"context"
	"fmt"
	"runtime"
	"sync"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

const (
	dynamicConfigGetter = "dynamicConfig"
)

// View represents a view of the on-ramp contract configuration.
type View struct {
	view.MetaData
	ChainSelector   uint64                            `json:"chainSelector,omitempty"`
	DynamicConfig   onramp.DynamicConfig              `json:"dynamicConfig,omitempty"`
	DestChainConfig map[uint64]onramp.DestChainConfig `json:"feeQuoterDestChainConfig,omitempty"`
}

// FetchView generates a view of the on-ramp contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, onRampAddr *address.Address, srcSelector uint64) (*View, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, onRampAddr, view.VersionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %w", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, onRampAddr, dynamicConfigGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting dynamicConfig: %w", err)
	}

	var dConfig onramp.DynamicConfig
	if err = dConfig.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse dynamicConfig: %w", err)
	}

	destChainConfig, err := fetchDestChainConfig(ctx, c, block, onRampAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch dest chain config: %w", err)
	}

	return &View{
		MetaData: view.MetaData{
			Address:      onRampAddr,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		ChainSelector:   srcSelector,
		DynamicConfig:   dConfig,
		DestChainConfig: destChainConfig,
	}, nil
}

// fetchDestChainConfig retrieves destination chain configurations from the on-ramp contract.
func fetchDestChainConfig(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, onRampAddr *address.Address) (map[uint64]onramp.DestChainConfig, error) {
	result, err := c.Client.RunGetMethod(ctx, block, onRampAddr, view.DestChainsGetter)
	if err != nil {
		return nil, err
	}

	chainSelectors := view.ParseExecutionResultForDestChainSelectors(result.AsTuple())

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	output := make(map[uint64]onramp.DestChainConfig)
	for _, dest := range chainSelectors {
		eg.Go(func() error {
			result, err := c.Client.RunGetMethod(egCtx, block, onRampAddr, view.DestChainConfigGetter, dest) // New variables per goroutine
			if err != nil {
				return err
			}
			var cfg onramp.DestChainConfig
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

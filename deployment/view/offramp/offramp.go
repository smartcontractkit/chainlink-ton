package offramp

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
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
)

type View struct {
	view.MetaData
	LatestPriceSequenceNumber uint64                               `json:"latestPriceSequenceNumber,omitempty"`
	Config                    offramp.Config                       `json:"Config,omitempty"`
	SourceChainConfigs        map[uint64]offramp.SourceChainConfig `json:"sourceChainConfigs,omitempty"`
}

// FetchView generates a view of the offramp contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, offRampAddr *address.Address) (*View, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, offRampAddr, view.VersionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %w", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	var offRampConfig offramp.Config
	result, err = c.Client.RunGetMethod(ctx, block, offRampAddr, view.ConfigGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting offRamp config: %w", err)
	}

	if err = offRampConfig.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse offRamp config: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, offRampAddr, view.LatestPriceSequenceNumberGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting latestPriceSequenceNumber: %w", err)
	}

	latestSeqNumInt, err := result.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to get latestPriceSequenceNumber: %w", err)
	}

	sourceChainConfigs, err := fetchSrcChainConfig(ctx, c, block, offRampAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch source chain configs: %w", err)
	}

	return &View{
		MetaData: view.MetaData{
			Address:      offRampAddr,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		LatestPriceSequenceNumber: latestSeqNumInt.Uint64(),
		Config:                    offRampConfig,
		SourceChainConfigs:        sourceChainConfigs,
	}, nil
}

// fetchSrcChainConfig retrieves source chain configurations from the off-ramp contract.
func fetchSrcChainConfig(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, offRampAddr *address.Address) (map[uint64]offramp.SourceChainConfig, error) {
	result, err := c.Client.RunGetMethod(ctx, block, offRampAddr, view.DestChainsGetter)
	if err != nil {
		return nil, err
	}

	var eg errgroup.Group
	eg.SetLimit(runtime.NumCPU())
	var lock sync.Mutex
	output := make(map[uint64]offramp.SourceChainConfig)
	chainSelectors := view.ParseExecutionResultForDestChainSelectors(result.AsTuple())

	for _, dest := range chainSelectors {
		eg.Go(func() error {
			result, err := c.Client.RunGetMethod(ctx, block, offRampAddr, view.SrcChainConfigGetter, dest)
			if err != nil {
				return err
			}
			var cfg offramp.SourceChainConfig
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

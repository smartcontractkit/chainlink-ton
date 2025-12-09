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

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
)

const (
	latestPriceSequenceNumberGetter = "latestPriceSequenceNumber"
	sourceChainsGetter              = "sourceChainSelectors"
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
	if err := tvm.FetchResult(ctx, c.Client, block, offRampAddr, &typeVersion, nil); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	var offRampConfig offramp.Config
	if err := tvm.FetchResult(ctx, c.Client, block, offRampAddr, &offRampConfig, nil); err != nil {
		return nil, fmt.Errorf("failed to parse OffRamp Config: %w", err)
	}

	result, err := c.Client.RunGetMethod(ctx, block, offRampAddr, latestPriceSequenceNumberGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting latestPriceSequenceNumber: %w", err)
	}

	latestSeqNumInt, err := result.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to get latestPriceSequenceNumber: %w", err)
	}

	var sourceChainConfigs SourceChainConfigMap
	if err := sourceChainConfigs.Fetch(ctx, c.Client, block, offRampAddr); err != nil {
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

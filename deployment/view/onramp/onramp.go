package onramp

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
	ccipcommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
)

const DestChainsGetter = "destChainSelectors"

// View represents a view of the on-ramp contract configuration.
type View struct {
	view.MetaData
	ChainSelector   uint64                            `json:"chainSelector,omitempty"`
	DynamicConfig   onramp.DynamicConfig              `json:"dynamicConfig,omitempty"`
	DestChainConfig map[uint64]onramp.DestChainConfig `json:"feeQuoterDestChainConfig,omitempty"`
}

// FetchView generates a view of the on-ramp contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, onRampAddr *address.Address, srcSelector uint64) (*View, error) {
	var typeVersion ccipcommon.TypeAndVersion
	if err := tvm.FetchResult(ctx, c.Client, block, onRampAddr, &typeVersion, nil); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	var dConfig onramp.DynamicConfig
	if err := tvm.FetchResult(ctx, c.Client, block, onRampAddr, &dConfig, nil); err != nil {
		return nil, fmt.Errorf("failed to parse DynamicConfig: %w", err)
	}

	var destChainConfig destChainConfigMap
	if err := destChainConfig.Fetch(ctx, c.Client, block, onRampAddr); err != nil {
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

// destChainConfigMap represents a map of destination chain selectors to their configurations.
// This type aligns with the on-chain data structure for destination chain configs.
type destChainConfigMap map[uint64]onramp.DestChainConfig

// Fetch retrieves all destination chain configurations from the on-ramp contract.
func (d *destChainConfigMap) Fetch(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, onRampAddr *address.Address) error {
	result, err := client.RunGetMethod(ctx, block, onRampAddr, DestChainsGetter)
	if err != nil {
		return err
	}

	chainSelectors := parser.ParseLispTuple(result.AsTuple())

	var lock sync.Mutex
	eg, egCtx := errgroup.WithContext(ctx)
	eg.SetLimit(runtime.NumCPU())
	output := make(destChainConfigMap)
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

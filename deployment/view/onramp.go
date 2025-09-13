package view

import (
	"context"
	"fmt"
	"math/big"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

const (
	dynamicConfigGetter = "dynamicConfig"
)

type OnRampView struct {
	metaData
	ChainSelector   uint64                           `json:"chainSelector,omitempty"`
	DynamicConfig   dynamicConfig                    `json:"dynamicConfig"`
	DestChainConfig map[uint64]onRampDestChainConfig `json:"feeQuoterDestChainConfig"`
}

// DynamicConfig holds the dynamic configuration for the CCIP system, including fee quoter, fee aggregator, and allow list admin.
type dynamicConfig struct {
	FeeQuoter      string
	FeeAggregator  string
	AllowListAdmin string
}

type onRampDestChainConfig struct {
	SequenceNumber   uint64
	AllowlistEnabled bool
	Router           string
	// add allowedSenders ? missing from onramp binding now
}

func GenerateOnRampView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, onrampAddr *address.Address, srcSelector uint64) (*OnRampView, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, onrampAddr, versionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %v", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, onrampAddr, dynamicConfigGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting dynamicConfig: %v", err)
	}

	var dConfig onramp.DynamicConfig
	if err = dConfig.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse dynamicConfig: %w", err)
	}

	destChainConfig, err := fetchDestChainConfig(ctx, c, block, onrampAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch dest chain config: %w", err)
	}

	return &OnRampView{
		metaData: metaData{
			Address:      onrampAddr.String(),
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		ChainSelector: srcSelector,
		DynamicConfig: dynamicConfig{
			FeeQuoter:      dConfig.FeeQuoter.String(),
			FeeAggregator:  dConfig.FeeAggregator.String(),
			AllowListAdmin: dConfig.AllowListAdmin.String(),
		},
		DestChainConfig: destChainConfig,
	}, nil
}

// fetchDestChainConfig retrieves destination chain configurations from the on-ramp contract.
func fetchDestChainConfig(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, onrampAddr *address.Address) (map[uint64]onRampDestChainConfig, error) {
	result, err := c.Client.RunGetMethod(ctx, block, onrampAddr, destChainGetter)
	if err != nil {
		return nil, err
	}

	selectorSliceRaw := result.AsTuple()[0]
	selectorSlice, ok := selectorSliceRaw.([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected type for selector slice")
	}

	output := make(map[uint64]onRampDestChainConfig)
	for _, selector := range selectorSlice {
		// On-chain returns *big.Int for selector values, convert to uint64
		if bigInt, ok := selector.(*big.Int); ok {
			dest := bigInt.Uint64()
			result, err = c.Client.RunGetMethod(ctx, block, onrampAddr, destChainConfigGetter, dest)
			if err != nil {
				return nil, err
			}
			var cfg onramp.DestChainConfig
			if err = cfg.FromResult(result); err != nil {
				return nil, err
			}

			output[dest] = onRampDestChainConfig{
				SequenceNumber:   cfg.SequenceNumber,
				AllowlistEnabled: cfg.AllowListEnabled,
				Router:           cfg.Router.String(),
			}
		}
	}

	return output, nil
}

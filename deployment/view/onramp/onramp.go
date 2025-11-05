package onramp

import (
	"context"
	"fmt"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	configfetcher "github.com/smartcontractkit/chainlink-ton/pkg/ccip/common"

	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	ccipcommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
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
	var typeVersion ccipcommon.TypeAndVersion
	if err := typeVersion.FetchResult(ctx, c.Client, block, onRampAddr, nil); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	var dConfig onramp.DynamicConfig
	if err := dConfig.FetchResult(ctx, c.Client, block, onRampAddr, nil); err != nil {
		return nil, fmt.Errorf("failed to parse DynamicConfig: %w", err)
	}

	destChainConfig, err := configfetcher.FetchOnRampDestChainConfig(ctx, c.Client, block, onRampAddr)
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

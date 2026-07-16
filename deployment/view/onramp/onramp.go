package onramp

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	ccipcommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	onrampview "github.com/smartcontractkit/chainlink-ton/pkg/ccip/view/onramp"
)

// View represents a view of the on-ramp contract configuration.
type View struct {
	view.MetaData
	ChainSelector   uint64                            `json:"chainSelector,omitempty"`
	DynamicConfig   onramp.DynamicConfig              `json:"dynamicConfig,omitempty"` //nolint:modernize // modernize tells omitempty has no effect on nested struct fields, suggesting replacing with omitzero. TODO review if change is backwards compatible.
	DestChainConfig map[uint64]onramp.DestChainConfig `json:"feeQuoterDestChainConfig,omitempty"`
}

// FetchView generates a view of the on-ramp contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, onRampAddr *address.Address, srcSelector uint64) (*View, error) {
	typeVersion, err := tvm.CallGetter(ctx, c.Client, block, onRampAddr, ccipcommon.GetTypeAndVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	dConfig, err := tvm.CallGetter(ctx, c.Client, block, onRampAddr, onramp.GetDynamicConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to parse DynamicConfig: %w", err)
	}

	var destChainConfig onrampview.DestChainConfigMap
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

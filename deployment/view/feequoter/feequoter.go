package feequoter

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
)

// View represents a view of the fee quoter contract configuration.
type View struct {
	view.MetaData
	StaticConfig    feequoter.StaticConfig               `json:"staticConfig"`
	DestChainConfig map[uint64]feequoter.DestChainConfig `json:"destChainConfig,omitempty"`
}

// FetchView generates a view of the fee quoter contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, feeQuoter *address.Address) (*View, error) {
	typeVersion, err := tvm.CallGetter(ctx, c.Client, block, feeQuoter, common.GetTypeAndVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	sc, err := tvm.CallGetter(ctx, c.Client, block, feeQuoter, feequoter.GetStaticConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to parse StaticConfig: %w", err)
	}

	var destConfigs feequoter.DestChainConfigMap
	if err := destConfigs.Fetch(ctx, c.Client, block, feeQuoter); err != nil {
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

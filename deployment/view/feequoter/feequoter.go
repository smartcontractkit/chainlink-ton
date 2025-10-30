package feequoter

import (
	"context"
	"fmt"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	configfetcher "github.com/smartcontractkit/chainlink-ton/pkg/ccip/common"

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
	var typeVersion common.TypeAndVersion
	if err := typeVersion.FetchResult(ctx, c.Client, block, feeQuoter, nil); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	var sc feequoter.StaticConfig
	if err := sc.FetchResult(ctx, c.Client, block, feeQuoter, nil); err != nil {
		return nil, fmt.Errorf("failed to parse StaticConfig: %w", err)
	}

	destConfigs, err := configfetcher.FetchFeeQuoterDestChainConfigs(ctx, c.Client, block, feeQuoter)
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

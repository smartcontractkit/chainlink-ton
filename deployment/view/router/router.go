package router

import (
	"context"
	"fmt"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	configfetcher "github.com/smartcontractkit/chainlink-ton/pkg/ccip/common"

	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type View struct {
	view.MetaData
	OnRampAddresses map[uint64]*address.Address `json:"onRampAddresses,omitempty"`
}

// FetchView generates a view of the router contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, routerAddr *address.Address) (*View, error) {
	var typeVersion common.TypeAndVersion
	if err := typeVersion.FetchResult(ctx, c.Client, block, routerAddr, nil); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	addresses, err := configfetcher.FetchRouterOnRampAddresses(ctx, c.Client, block, routerAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch onRamp addresses: %w", err)
	}

	return &View{
		MetaData: view.MetaData{
			Address:      routerAddr,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		OnRampAddresses: addresses,
	}, nil
}

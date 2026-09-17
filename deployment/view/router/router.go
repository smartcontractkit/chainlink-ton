package router

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	routerview "github.com/smartcontractkit/chainlink-ton/pkg/ccip/view/router"
)

type View struct {
	view.MetaData
	OnRampAddresses map[uint64]*address.Address `json:"onRampAddresses,omitempty"`
}

// FetchView generates a view of the router contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, routerAddr *address.Address) (*View, error) {
	typeVersion, err := tvm.CallGetter(ctx, c.Client, block, routerAddr, common.GetTypeAndVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	var addresses routerview.OnRampAddressMap
	if err := addresses.Fetch(ctx, c.Client, block, routerAddr); err != nil {
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

package router

import (
	"context"
	"fmt"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
)

type View struct {
	view.MetaData
	OnRampAddresses map[uint64]*address.Address `json:"onRampAddresses,omitempty"`
}

// FetchView generates a view of the router contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, routerAddr *address.Address) (*View, error) {
	var typeVersion common.TypeAndVersion
	if err := tvm.FetchResult(ctx, c.Client, block, routerAddr, &typeVersion, nil); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	var addresses router.OnRampAddressMap
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

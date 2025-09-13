package view

import (
	"context"
	"fmt"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

const (
	versionGetter = "typeAndVersion"
	onRampGetter  = "onRamp"
)

type RouterView struct {
	metaData
	OnRampAddr string `json:"onRampAddr"`
}

func GenerateRouterView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, routerAddr *address.Address) (*RouterView, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, routerAddr, versionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %v", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, routerAddr, onRampGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting onrampAddr: %v", err)
	}
	cell, err := result.Slice(0)
	if err != nil {
		return nil, err
	}

	onRampAddr, err := cell.LoadAddr()
	if err != nil {
		return nil, fmt.Errorf("failed to load onramp address: %w", err)
	}

	return &RouterView{
		metaData: metaData{
			Address:      routerAddr.String(),
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		OnRampAddr: onRampAddr.String(),
	}, nil
}

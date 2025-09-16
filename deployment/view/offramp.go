package view

import (
	"context"
	"fmt"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

type OffRampView struct {
	MetaData
	// TODO add remaining fields once offramp getters are implemented in the contract
}

// FetchOffRampView generates a view of the offramp contract at the specified block.
func FetchOffRampView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, offRampAddr *address.Address) (*OffRampView, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, offRampAddr, versionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %v", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	return &OffRampView{
		MetaData: MetaData{
			Address:      offRampAddr,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
	}, nil
}

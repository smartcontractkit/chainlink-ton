package offramp

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"

	"github.com/smartcontractkit/chainlink-ton/deployment/view"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	offrampview "github.com/smartcontractkit/chainlink-ton/pkg/ccip/view/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

const latestPriceSequenceNumberGetter = "latestPriceSequenceNumber"

type View struct {
	view.MetaData
	LatestPriceSequenceNumber uint64                               `json:"latestPriceSequenceNumber,omitempty"`
	Config                    offramp.Config                       `json:"Config,omitempty"` //nolint:modernize // modernize tells omitempty has no effect on nested struct fields, suggesting replacing with omitzero. TODO review if change is backwards compatible.
	SourceChainConfigs        map[uint64]offramp.SourceChainConfig `json:"sourceChainConfigs,omitempty"`
}

// FetchView generates a view of the offramp contract at the specified block.
func FetchView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, offRampAddr *address.Address) (*View, error) {
	typeVersion, err := tvm.CallGetter(ctx, c.Client, block, offRampAddr, common.GetTypeAndVersion)
	if err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	offRampConfig, err := tvm.CallGetter(ctx, c.Client, block, offRampAddr, offramp.GetConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to parse OffRamp Config: %w", err)
	}

	result, err := c.Client.WaitForBlock(block.SeqNo).RunGetMethod(ctx, block, offRampAddr, latestPriceSequenceNumberGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting latestPriceSequenceNumber: %w", err)
	}

	latestSeqNumInt, err := result.Int(0)
	if err != nil {
		return nil, fmt.Errorf("failed to get latestPriceSequenceNumber: %w", err)
	}

	var sourceChainConfigs offrampview.SourceChainConfigMap
	if err := sourceChainConfigs.Fetch(ctx, c.Client, block, offRampAddr); err != nil {
		return nil, fmt.Errorf("failed to fetch source chain configs: %w", err)
	}

	return &View{
		MetaData: view.MetaData{
			Address:      offRampAddr,
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		LatestPriceSequenceNumber: latestSeqNumInt.Uint64(),
		Config:                    offRampConfig,
		SourceChainConfigs:        sourceChainConfigs,
	}, nil
}

package view

import (
	"context"
	"fmt"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type OffRampView struct {
	MetaData
	ChainSelector                           uint64                       `json:"chainSelector,omitempty"`
	LatestPriceSequenceNumber               uint64                       `json:"latestPriceSequenceNumber,omitempty"`
	PermissionlessExecutionThresholdSeconds uint32                       `json:"permissionlessExecutionThresholdSeconds,omitempty"`
	SourceChainConfigs                      map[uint64]SourceChainConfig `json:"sourceChainConfigs,omitempty"`
}

type SourceChainConfig struct {
	Router                    string `json:"router,omitempty"`
	IsEnabled                 bool   `json:"isEnabled,omitempty"`
	MinSeqNr                  uint64 `json:"minSeqNr,omitempty"`
	IsRMNVerificationDisabled bool   `json:"isRMNVerificationDisabled,omitempty"`
	OnRamp                    string `json:"onRamp,omitempty"`
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

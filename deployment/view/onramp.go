package view

import (
	"context"
	"fmt"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const (
	dynamicConfigGetter = "dynamicConfig"
)

// OnRampView represents a view of the on-ramp contract configuration.
type OnRampView struct {
	MetaData
	ChainSelector   uint64                           `json:"chainSelector,omitempty"`
	DynamicConfig   DynamicConfig                    `json:"dynamicConfig,omitempty"`
	DestChainConfig map[uint64]OnRampDestChainConfig `json:"feeQuoterDestChainConfig,omitempty"`
}

type DynamicConfig struct {
	FeeQuoter      string
	FeeAggregator  string
	AllowListAdmin string
}

type OnRampDestChainConfig struct {
	SequenceNumber   uint64 `json:"sequenceNumber,omitempty"`
	AllowlistEnabled bool   `json:"allowlistEnabled,omitempty"`
	Router           string `json:"router,omitempty"`
	// TODO add allowedSenders
}

// FetchOnRampView generates a view of the on-ramp contract at the specified block.
func FetchOnRampView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, onrampAddr *address.Address, srcSelector uint64) (*OnRampView, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, onrampAddr, versionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %v", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, onrampAddr, dynamicConfigGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting dynamicConfig: %v", err)
	}

	var dConfig onramp.DynamicConfig
	if err = dConfig.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse dynamicConfig: %w", err)
	}

	destChainConfig, err := fetchDestChainConfig(ctx, c, block, onrampAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch dest chain config: %w", err)
	}

	return &OnRampView{
		MetaData: MetaData{
			Address:      onrampAddr.String(),
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		ChainSelector: srcSelector,
		DynamicConfig: DynamicConfig{
			FeeQuoter:      dConfig.FeeQuoter.String(),
			FeeAggregator:  dConfig.FeeAggregator.String(),
			AllowListAdmin: dConfig.AllowListAdmin.String(),
		},
		DestChainConfig: destChainConfig,
	}, nil
}

func fetchDestChainConfig(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, onrampAddr *address.Address) (map[uint64]OnRampDestChainConfig, error) {
	output := make(map[uint64]OnRampDestChainConfig)
	result, err := c.Client.RunGetMethod(ctx, block, onrampAddr, allDestChainConfigGetter)
	if err != nil {
		return nil, err
	}

	configDictRaw, err := result.Cell(0)
	if err != nil {
		return nil, fmt.Errorf("failed to get cell from result: %w", err)
	}

	configDict := configDictRaw.AsDict(64)
	all, err := configDict.LoadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to load all entries from dictionary: %w", err)
	}

	var chainSel uint64
	var cfgCell *cell.Cell
	for _, val := range all {
		chainSel, err = val.Key.LoadUInt(64)
		if err != nil {
			return nil, fmt.Errorf("failed to load chain selector: %w", err)
		}
		cfgCell, err = val.Value.ToCell()
		if err != nil {
			return nil, fmt.Errorf("failed to convert value to cell: %w", err)
		}
		var cfg onramp.DestChainConfig
		err := tlb.LoadFromCell(&cfg, cfgCell.BeginParse())
		if err != nil {
			return nil, fmt.Errorf("failed to parse DestChainConfig from cell: %w", err)
		}

		output[chainSel] = OnRampDestChainConfig{
			SequenceNumber:   cfg.SequenceNumber,
			AllowlistEnabled: cfg.AllowListEnabled,
			Router:           cfg.Router.String(),
		}
	}
	return output, nil
}

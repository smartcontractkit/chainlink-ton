package view

import (
	"context"
	"fmt"
	"math/big"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
)

const (
	staticConfigGetter = "staticConfig"
)

// FeeQuoterView represents a view of the fee quoter contract configuration.
type FeeQuoterView struct {
	metaData
	StaticConfig    staticConfig                        `json:"staticConfig"`
	DestChainConfig map[uint64]feeQuoterDestChainConfig `json:"feeQuoterDestChainConfig"`
	// TODO saw usdPerToken and premiumMultiplierWeiPerEth are marked, check if we need to add them here too
}

type staticConfig struct {
	MaxFeeJuelsPerMsg  string `json:"maxFeeJuelsPerMsg,omitempty"`
	LinkToken          string `json:"linkToken,omitempty"`
	StalenessThreshold uint32 `json:"stalenessThreshold,omitempty"`
}

type feeQuoterDestChainConfig struct {
	IsEnabled                         bool   `json:"isEnabled,omitempty"`
	MaxNumberOfTokensPerMsg           uint16 `json:"maxNumberOfTokensPerMsg,omitempty"`
	MaxDataBytes                      uint32 `json:"maxDataBytes,omitempty"`
	MaxPerMsgGasLimit                 uint32 `json:"maxPerMsgGasLimit,omitempty"`
	DestGasOverhead                   uint32 `json:"destGasOverhead,omitempty"`
	DestGasPerPayloadByteBase         uint8  `json:"destGasPerPayloadByteBase,omitempty"`
	DestGasPerPayloadByteHigh         uint8  `json:"destGasPerPayloadByteHigh,omitempty"`
	DestGasPerPayloadByteThreshold    uint16 `json:"destGasPerPayloadByteThreshold,omitempty"`
	DestDataAvailabilityOverheadGas   uint32 `json:"destDataAvailabilityOverheadGas,omitempty"`
	DestGasPerDataAvailabilityByte    uint16 `json:"destGasPerDataAvailabilityByte,omitempty"`
	DestDataAvailabilityMultiplierBps uint16 `json:"destDataAvailabilityMultiplierBps,omitempty"`
	ChainFamilySelector               uint32 `json:"chainFamilySelector,omitempty"`
	EnforceOutOfOrder                 bool   `json:"enforceOutOfOrder,omitempty"`
	DefaultTokenFeeUsdCents           uint16 `json:"defaultTokenFeeUsdCents,omitempty"`
	DefaultTokenDestGasOverhead       uint32 `json:"defaultTokenDestGasOverhead,omitempty"`
	DefaultTxGasLimit                 uint32 `json:"defaultTxGasLimit,omitempty"`
	GasMultiplierWeiPerEth            uint64 `json:"gasMultiplierWeiPerEth,omitempty"`
	GasPriceStalenessThreshold        uint32 `json:"gasPriceStalenessThreshold,omitempty"`
	NetworkFeeUsdCents                uint32 `json:"networkFeeUsdCents,omitempty"`
}

// GenerateFeeQuoterView generates a view of the fee quoter contract at the specified block.
func GenerateFeeQuoterView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, feeQuoter *address.Address) (*FeeQuoterView, error) {
	var typeVersion common.TypeAndVersion
	result, err := c.Client.RunGetMethod(ctx, block, feeQuoter, versionGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %v", err)
	}
	if err = typeVersion.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse typeAndVersion: %w", err)
	}

	result, err = c.Client.RunGetMethod(ctx, block, feeQuoter, staticConfigGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting typeAndVersion: %v", err)
	}

	var sc feequoter.StaticConfig
	if err = sc.FromResult(result); err != nil {
		return nil, fmt.Errorf("failed to parse StaticConfig: %w", err)
	}

	destConfigs, err := generateDestChainConfigsView(ctx, c, block, feeQuoter)
	if err != nil {
		return nil, fmt.Errorf("failed to generate dest chain config view: %w", err)
	}

	return &FeeQuoterView{
		metaData: metaData{
			Address:      feeQuoter.String(),
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		StaticConfig: staticConfig{
			MaxFeeJuelsPerMsg:  sc.MaxFeeJuelsPerMsg.String(),
			LinkToken:          sc.LinkToken.String(),
			StalenessThreshold: sc.StalenessThreshold,
		},
		DestChainConfig: destConfigs,
	}, nil
}

func generateDestChainConfigsView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, feeQuoter *address.Address) (map[uint64]feeQuoterDestChainConfig, error) {
	result, err := c.Client.RunGetMethod(ctx, block, feeQuoter, destChainGetter)
	if err != nil {
		return nil, err
	}

	selectorSliceRaw := result.AsTuple()[0]
	selectorSlice, ok := selectorSliceRaw.([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected type for selector slice")
	}

	output := make(map[uint64]feeQuoterDestChainConfig)
	for _, selector := range selectorSlice {
		// On-chain returns *big.Int for selector values, convert to uint64
		if bigInt, ok := selector.(*big.Int); ok {
			dest := bigInt.Uint64()
			result, err = c.Client.RunGetMethod(ctx, block, feeQuoter, destChainConfigGetter, dest)
			if err != nil {
				return nil, err
			}
			var cfg feequoter.DestChainConfig
			if err = cfg.FromResult(result); err != nil {
				return nil, err
			}

			output[dest] = feeQuoterDestChainConfig{
				IsEnabled:                         cfg.IsEnabled,
				MaxNumberOfTokensPerMsg:           cfg.MaxNumberOfTokensPerMsg,
				MaxDataBytes:                      cfg.MaxDataBytes,
				MaxPerMsgGasLimit:                 cfg.MaxPerMsgGasLimit,
				DestGasOverhead:                   cfg.DestGasOverhead,
				DestGasPerPayloadByteBase:         cfg.DestGasPerPayloadByteBase,
				DestGasPerPayloadByteHigh:         cfg.DestGasPerPayloadByteHigh,
				DestGasPerPayloadByteThreshold:    cfg.DestGasPerPayloadByteThreshold,
				DestDataAvailabilityOverheadGas:   cfg.DestDataAvailabilityOverheadGas,
				DestGasPerDataAvailabilityByte:    cfg.DestGasPerDataAvailabilityByte,
				DestDataAvailabilityMultiplierBps: cfg.DestDataAvailabilityMultiplierBps,
				ChainFamilySelector:               cfg.ChainFamilySelector,
				EnforceOutOfOrder:                 cfg.EnforceOutOfOrder,
				DefaultTokenFeeUsdCents:           cfg.DefaultTokenFeeUsdCents,
				DefaultTokenDestGasOverhead:       cfg.DefaultTokenDestGasOverhead,
				DefaultTxGasLimit:                 cfg.DefaultTxGasLimit,
				GasMultiplierWeiPerEth:            cfg.GasMultiplierWeiPerEth,
				GasPriceStalenessThreshold:        cfg.GasPriceStalenessThreshold,
				NetworkFeeUsdCents:                cfg.NetworkFeeUsdCents,
			}
		}
	}

	return output, nil
}

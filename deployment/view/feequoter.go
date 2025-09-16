package view

import (
	"context"
	"fmt"
	"math/big"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const (
	staticConfigGetter              = "staticConfig"
	feeTokensGetter                 = "feeTokens"
	tokenPriceGetter                = "tokenPrice"
	usdPerTokensGetter              = "usdPerTokens"
	feeTokenPremiumMultiplierGetter = "feeTokenPremiumMultiplier"
)

// FeeQuoterView represents a view of the fee quoter contract configuration.
type FeeQuoterView struct {
	MetaData
	StaticConfig       StaticConfig                  `json:"staticConfig,omitempty"`
	PremiumMultipliers map[string]PremiumMultipliers `json:"premiumMultipliers,omitempty"`
	USDPerTokens       map[string]USDPerToken        `json:"usdPerTokens,omitempty"`
	DestChainConfig    map[uint64]DestChainConfig    `json:"destChainConfig,omitempty"`
}

type PremiumMultipliers struct {
	PremiumMultiplierWeiPerEth uint64 `json:"premiumMultiplierWeiPerEth,omitempty"`
}

type USDPerToken struct {
	Value     string `json:"value"`
	Timestamp uint64 `json:"timestamp,omitempty"`
}

type StaticConfig struct {
	MaxFeeJuelsPerMsg  string `json:"maxFeeJuelsPerMsg,omitempty"`
	LinkToken          string `json:"linkToken,omitempty"`
	StalenessThreshold uint32 `json:"stalenessThreshold,omitempty"`
}

type USDPerUnitGas struct {
	ExecutionGasPrice        string `json:"executionGasPrice,omitempty"`
	DataAvailabilityGasPrice string `json:"dataAvailabilityGasPrice,omitempty"`
	Timestamp                uint64 `json:"timestamp,omitempty"`
}

type DestChainConfig struct {
	Config        FeeQuoterDestChainConfig `json:"config,omitempty"`
	USDPerUnitGas USDPerUnitGas            `json:"usdPerUnitGas,omitempty"`
	// TODO add tokenTransferFeeConfigs after update_lane sequence supports
}

type FeeQuoterDestChainConfig struct {
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

// FetchFeeQuoterView generates a view of the fee quoter contract at the specified block.
func FetchFeeQuoterView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, feeQuoter *address.Address) (*FeeQuoterView, error) {
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

	destConfigs, err := fetchDestChainConfigsView(ctx, c, block, feeQuoter)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch dest chain config view: %w", err)
	}

	premiumMultipliers, err := fetchFeeTokensPremiumMultiplierView(ctx, c, block, feeQuoter)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch fee tokens premium multiplier view: %w", err)
	}

	usdPerTokens, err := fetchTimestampedPriceView(ctx, c, block, feeQuoter)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch usd per tokens view: %w", err)
	}

	return &FeeQuoterView{
		MetaData: MetaData{
			Address:      feeQuoter.String(),
			ContractType: typeVersion.Type,
			Version:      typeVersion.Version,
		},
		StaticConfig: StaticConfig{
			MaxFeeJuelsPerMsg:  sc.MaxFeeJuelsPerMsg.String(),
			LinkToken:          sc.LinkToken.String(),
			StalenessThreshold: sc.StalenessThreshold,
		},
		PremiumMultipliers: premiumMultipliers,
		USDPerTokens:       usdPerTokens,
		DestChainConfig:    destConfigs,
	}, nil
}

func fetchTimestampedPriceView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, feeQuoter *address.Address) (map[string]USDPerToken, error) {
	result, err := c.Client.RunGetMethod(ctx, block, feeQuoter, usdPerTokensGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting usdPerTokens: %v", err)
	}

	tokenSliceRaw := result.AsTuple()[0]
	tokenSlice, ok := tokenSliceRaw.([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected type for token slice")
	}

	output := make(map[string]USDPerToken)
	for _, token := range tokenSlice {
		var tokenCell *cell.Slice
		var tokenAddr *address.Address
		if tokenCell, ok = token.(*cell.Slice); ok {
			result, err = c.Client.RunGetMethod(ctx, block, feeQuoter, tokenPriceGetter, tokenCell)
			if err != nil {
				return nil, fmt.Errorf("error getting tokenPrice: %v", err)
			}
			var price feequoter.TimestampedPrice
			if err = price.FromResult(result); err != nil {
				return nil, fmt.Errorf("error to parse TimestampedPrice: %v", err)
			}
			tokenAddr, err = tokenCell.LoadAddr()
			if err != nil {
				return nil, fmt.Errorf("error to parse token address: %v", err)
			}
			output[tokenAddr.String()] = USDPerToken{
				Value:     price.Value.String(),
				Timestamp: price.Timestamp,
			}
		}
	}

	return output, nil
}

func fetchFeeTokensPremiumMultiplierView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, feeQuoter *address.Address) (map[string]PremiumMultipliers, error) {
	result, err := c.Client.RunGetMethod(ctx, block, feeQuoter, feeTokensGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting feeTokens: %v", err)
	}

	tokenSliceRaw := result.AsTuple()[0]
	tokenSlice, ok := tokenSliceRaw.([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected type for token slice")
	}

	output := make(map[string]PremiumMultipliers)
	for _, token := range tokenSlice {
		var tokenCell *cell.Slice
		var tokenAddr *address.Address
		var multiplier *big.Int
		if tokenCell, ok = token.(*cell.Slice); ok {
			result, err = c.Client.RunGetMethod(ctx, block, feeQuoter, feeTokenPremiumMultiplierGetter, tokenCell)
			if err != nil {
				return nil, fmt.Errorf("error getting feeToken premium multiplier config: %v", err)
			}

			multiplier, err = result.Int(0)
			if err != nil {
				return nil, fmt.Errorf("error to parse feeToken premium multiplier: %v", err)
			}

			tokenAddr, err = tokenCell.LoadAddr()
			if err != nil {
				return nil, fmt.Errorf("error to parse token address: %v", err)
			}

			output[tokenAddr.String()] = PremiumMultipliers{
				PremiumMultiplierWeiPerEth: multiplier.Uint64(),
			}
		}
	}

	return output, nil
}

func fetchDestChainConfigsView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, feeQuoter *address.Address) (map[uint64]DestChainConfig, error) {
	result, err := c.Client.RunGetMethod(ctx, block, feeQuoter, destChainGetter)
	if err != nil {
		return nil, err
	}

	selectorSliceRaw := result.AsTuple()[0]
	selectorSlice, ok := selectorSliceRaw.([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected type for selector slice")
	}

	output := make(map[uint64]DestChainConfig)
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

			destConfig := DestChainConfig{
				Config: FeeQuoterDestChainConfig{
					IsEnabled:                         cfg.FQDestChainConfig.IsEnabled,
					MaxNumberOfTokensPerMsg:           cfg.FQDestChainConfig.MaxNumberOfTokensPerMsg,
					MaxDataBytes:                      cfg.FQDestChainConfig.MaxDataBytes,
					MaxPerMsgGasLimit:                 cfg.FQDestChainConfig.MaxPerMsgGasLimit,
					DestGasOverhead:                   cfg.FQDestChainConfig.DestGasOverhead,
					DestGasPerPayloadByteBase:         cfg.FQDestChainConfig.DestGasPerPayloadByteBase,
					DestGasPerPayloadByteHigh:         cfg.FQDestChainConfig.DestGasPerPayloadByteHigh,
					DestGasPerPayloadByteThreshold:    cfg.FQDestChainConfig.DestGasPerPayloadByteThreshold,
					DestDataAvailabilityOverheadGas:   cfg.FQDestChainConfig.DestDataAvailabilityOverheadGas,
					DestGasPerDataAvailabilityByte:    cfg.FQDestChainConfig.DestGasPerDataAvailabilityByte,
					DestDataAvailabilityMultiplierBps: cfg.FQDestChainConfig.DestDataAvailabilityMultiplierBps,
					ChainFamilySelector:               cfg.FQDestChainConfig.ChainFamilySelector,
					EnforceOutOfOrder:                 cfg.FQDestChainConfig.EnforceOutOfOrder,
					DefaultTokenFeeUsdCents:           cfg.FQDestChainConfig.DefaultTokenFeeUsdCents,
					DefaultTokenDestGasOverhead:       cfg.FQDestChainConfig.DefaultTokenDestGasOverhead,
					DefaultTxGasLimit:                 cfg.FQDestChainConfig.DefaultTxGasLimit,
					GasMultiplierWeiPerEth:            cfg.FQDestChainConfig.GasMultiplierWeiPerEth,
					GasPriceStalenessThreshold:        cfg.FQDestChainConfig.GasPriceStalenessThreshold,
					NetworkFeeUsdCents:                cfg.FQDestChainConfig.NetworkFeeUsdCents,
				},
			}

			if cfg.USDPerUnitGas != nil {
				gasPriceSlice := cfg.USDPerUnitGas.BeginParse()
				var gasPrice feequoter.USDPerUnitGas
				if err = tlb.LoadFromCell(&gasPrice, gasPriceSlice); err != nil {
					return nil, err
				}
				destConfig.USDPerUnitGas = USDPerUnitGas{
					ExecutionGasPrice:        gasPrice.ExecutionGasPrice.String(),
					DataAvailabilityGasPrice: gasPrice.DataAvailabilityGasPrice.String(),
					Timestamp:                gasPrice.Timestamp,
				}
			}

			// TODO parse tokenTransferFeeConfigs after update_lane sequence supports
			output[dest] = destConfig
		}
	}

	return output, nil
}

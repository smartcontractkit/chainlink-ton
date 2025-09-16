package view

import (
	"context"
	"fmt"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

const (
	staticConfigGetter                 = "staticConfig"
	allUSDPerTokensGetter              = "allUSDPerTokens"
	allFeeTokenPremiumMultiplierGetter = "allFeeTokenPremiumMultipliers"
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
	// TODO add tokenTransferFeeConfigs
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
	result, err := c.Client.RunGetMethod(ctx, block, feeQuoter, allUSDPerTokensGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting allUSDPerTokens: %v", err)
	}

	usdDictRaw, err := result.Cell(0)
	if err != nil {
		return nil, fmt.Errorf("failed to get raw usd dict cell from result: %w", err)
	}

	usdDict := usdDictRaw.AsDict(267)
	allTokens, err := usdDict.LoadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to load all entries from dictionary: %w", err)
	}

	output := make(map[string]USDPerToken)
	var tokenAddr *address.Address
	var priceCell *cell.Cell
	var price feequoter.TimestampedPrice
	for _, entry := range allTokens {
		tokenAddr, err = entry.Key.LoadAddr()
		if err != nil {
			return nil, fmt.Errorf("failed to load token address: %w", err)
		}

		priceCell, err = entry.Value.ToCell()
		if err != nil {
			return nil, fmt.Errorf("failed to convert value to cell: %w", err)
		}

		err = tlb.LoadFromCell(&price, priceCell.BeginParse())
		if err != nil {
			return nil, fmt.Errorf("failed to parse TimestampedPrice from cell: %w", err)
		}

		output[tokenAddr.String()] = USDPerToken{
			Value:     price.Value.String(),
			Timestamp: price.Timestamp,
		}
	}

	return output, nil
}

func fetchFeeTokensPremiumMultiplierView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, feeQuoter *address.Address) (map[string]PremiumMultipliers, error) {
	result, err := c.Client.RunGetMethod(ctx, block, feeQuoter, allFeeTokenPremiumMultiplierGetter)
	if err != nil {
		return nil, fmt.Errorf("error getting feeTokens: %v", err)
	}

	pmDictRaw, err := result.Cell(0)
	if err != nil {
		return nil, fmt.Errorf("failed to get raw premiumMultiplier dict cell from result: %w", err)
	}

	pmDict := pmDictRaw.AsDict(267)
	allDict, err := pmDict.LoadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to load all entries from dictionary: %w", err)
	}

	output := make(map[string]PremiumMultipliers)
	for _, entry := range allDict {
		tokenAddr, err := entry.Key.LoadAddr()
		if err != nil {
			return nil, fmt.Errorf("failed to load token address: %w", err)
		}

		multiplier, err := entry.Value.LoadUInt(64)
		if err != nil {
			return nil, fmt.Errorf("failed to load premium multiplier: %w", err)
		}

		output[tokenAddr.String()] = PremiumMultipliers{
			PremiumMultiplierWeiPerEth: multiplier,
		}
	}

	return output, nil
}

func fetchDestChainConfigsView(ctx context.Context, c cldf_ton.Chain, block *ton.BlockIDExt, feeQuoter *address.Address) (map[uint64]DestChainConfig, error) {
	result, err := c.Client.RunGetMethod(ctx, block, feeQuoter, allDestChainConfigGetter)
	if err != nil {
		return nil, err
	}

	dcDictRaw, err := result.Cell(0)
	if err != nil {
		return nil, fmt.Errorf("failed to get all dest chain config dict cell from result: %w", err)
	}

	pmDict := dcDictRaw.AsDict(64)
	allDict, err := pmDict.LoadAll()
	if err != nil {
		return nil, fmt.Errorf("failed to load all entries from dictionary: %w", err)
	}

	output := make(map[uint64]DestChainConfig)
	var selector uint64
	var cfgCell *cell.Cell
	var cfg feequoter.DestChainConfig
	for _, entry := range allDict {
		selector, err = entry.Key.LoadUInt(64)
		if err != nil {
			return nil, fmt.Errorf("failed to load chain selector: %w", err)
		}

		cfgCell, err = entry.Value.ToCell()
		if err != nil {
			return nil, fmt.Errorf("failed to convert value to cell: %w", err)
		}

		err = tlb.LoadFromCell(&cfg, cfgCell.BeginParse())
		if err != nil {
			return nil, fmt.Errorf("failed to parse DestChainConfig from cell: %w", err)
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

		// TODO parse tokenTransferFeeConfigs
		output[selector] = destConfig
	}

	return output, nil
}

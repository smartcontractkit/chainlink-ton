package model

import (
	"fmt"
	"math"
	"math/big"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
)

// ---------- Fee Quoter Model Struct Definitions ----------

type FeeQuoterStorage struct {
	ID                                uint32                      `json:"id"`
	Ownable                           Ownable2Step                `json:"ownable"`
	AllowedPriceUpdaters              []*address.Address          `json:"allowedPriceUpdaters"`
	MaxFeeJuelsPerMsg                 *big.Int                    `json:"maxFeeJuelsPerMsg"`
	LinkToken                         *address.Address            `json:"linkToken"`
	TokenPriceStalenessThreshold      uint64                      `json:"tokenPriceStalenessThreshold"`
	USDPerToken                       map[string]TimestampedPrice `json:"usdPerToken"`
	PremiumMultiplierWeiPerEthByToken map[string]uint64           `json:"premiumMultiplierWeiPerEthByToken"`
	DestChainConfigsByChainSelector   map[uint64]DestChainConfigs `json:"destChainConfigsByChainSelector"`
}

type DestChainConfigs struct {
	Config        DestChainConfig `json:"config"`
	USDPerUnitGas USDPerUnitGas   `json:"usdPerUnitGas"`
}

type DestChainConfig struct {
	IsEnabled                         bool   `json:"isEnabled"`
	MaxNumberOfTokensPerMsg           uint16 `json:"maxNumberOfTokensPerMsg"`
	MaxDataBytes                      uint32 `json:"maxDataBytes"`
	MaxPerMsgGasLimit                 uint32 `json:"maxPerMsgGasLimit"`
	DestGasOverhead                   uint32 `json:"destGasOverhead"`
	DestGasPerPayloadByteBase         uint8  `json:"destGasPerPayloadByteBase"`
	DestGasPerPayloadByteHigh         uint8  `json:"destGasPerPayloadByteHigh"`
	DestGasPerPayloadByteThreshold    uint16 `json:"destGasPerPayloadByteThreshold"`
	DestDataAvailabilityOverheadGas   uint32 `json:"destDataAvailabilityOverheadGas"`
	DestGasPerDataAvailabilityByte    uint16 `json:"destGasPerDataAvailabilityByte"`
	DestDataAvailabilityMultiplierBps uint16 `json:"destDataAvailabilityMultiplierBps"`
	ChainFamilySelector               uint32 `json:"chainFamilySelector"`
	DefaultTokenFeeUsdCents           uint16 `json:"defaultTokenFeeUsdCents"`
	DefaultTokenDestGasOverhead       uint32 `json:"defaultTokenDestGasOverhead"`
	DefaultTxGasLimit                 uint32 `json:"defaultTxGasLimit"`
	GasMultiplierWeiPerEth            uint64 `json:"gasMultiplierWeiPerEth"`
	GasPriceStalenessThreshold        uint32 `json:"gasPriceStalenessThreshold"`
	NetworkFeeUsdCents                uint32 `json:"networkFeeUsdCents"`
}

type USDPerUnitGas struct {
	ExecutionGasPrice        *big.Int  `json:"executionGasPrice"`
	DataAvailabilityGasPrice *big.Int  `json:"dataAvailabilityGasPrice"`
	Timestamp                time.Time `json:"timestamp"`
}

type TimestampedPrice struct {
	Value     *big.Int  `json:"value"`
	Timestamp time.Time `json:"timestamp"`
}

// ---------- Builder ----------

type FeeQuoterStorageBuilder struct {
	storage FeeQuoterStorage
	err     error
}

// NewFeeQuoterStorageBuilder creates a new builder with zero-value storage
// and initialized maps.
func NewFeeQuoterStorageBuilder() *FeeQuoterStorageBuilder {
	return &FeeQuoterStorageBuilder{
		storage: FeeQuoterStorage{
			USDPerToken:                       make(map[string]TimestampedPrice),
			PremiumMultiplierWeiPerEthByToken: make(map[string]uint64),
			DestChainConfigsByChainSelector:   make(map[uint64]DestChainConfigs),
		},
	}
}

func (b *FeeQuoterStorageBuilder) WithID(id uint32) *FeeQuoterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.ID = id
	return b
}

func (b *FeeQuoterStorageBuilder) WithOwnable(owner, pending *address.Address) *FeeQuoterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.Ownable = Ownable2Step{
		Owner:        owner,
		PendingOwner: pending,
	}
	return b
}

func (b *FeeQuoterStorageBuilder) WithAllowedPriceUpdater(priceUpdater *address.Address) *FeeQuoterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.AllowedPriceUpdaters = append(b.storage.AllowedPriceUpdaters, priceUpdater)
	return b
}

func (b *FeeQuoterStorageBuilder) WithMaxFeeJuelsPerMsg(maxFeeJuelsPerMsg *big.Int) *FeeQuoterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.MaxFeeJuelsPerMsg = new(big.Int).Set(maxFeeJuelsPerMsg)
	return b
}

func (b *FeeQuoterStorageBuilder) WithLinkToken(linkToken *address.Address) *FeeQuoterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.LinkToken = linkToken
	return b
}

func (b *FeeQuoterStorageBuilder) WithTokenPriceStalenessThreshold(tokenPriceStalenessThreshold uint64) *FeeQuoterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.TokenPriceStalenessThreshold = tokenPriceStalenessThreshold
	return b
}

func (b *FeeQuoterStorageBuilder) WithUSDPerToken(token *address.Address, value *big.Int, timestamp time.Time) *FeeQuoterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.USDPerToken[token.String()] = TimestampedPrice{
		Value:     new(big.Int).Set(value),
		Timestamp: timestamp,
	}
	return b
}

func (b *FeeQuoterStorageBuilder) WithPremiumMultiplier(token *address.Address, multiplier uint64) *FeeQuoterStorageBuilder {
	if b.err != nil {
		return b
	}
	b.storage.PremiumMultiplierWeiPerEthByToken[token.String()] = multiplier
	return b
}

func (b *FeeQuoterStorageBuilder) WithDestChainConfig(selector uint64, cfg DestChainConfigs) *FeeQuoterStorageBuilder {
	if b.err != nil {
		return b
	}

	// It seems that TON cell decoding pre-allocated a larger slice capacity making diff between models when:
	// original model -> binding -> re-calculated model
	cfg.USDPerUnitGas.ExecutionGasPrice = new(big.Int).Set(cfg.USDPerUnitGas.ExecutionGasPrice)
	cfg.USDPerUnitGas.DataAvailabilityGasPrice = new(big.Int).Set(cfg.USDPerUnitGas.DataAvailabilityGasPrice)

	b.storage.DestChainConfigsByChainSelector[selector] = cfg
	return b
}

// Build returns the constructed FeeQuoterStorage or an error if any step failed.
func (b *FeeQuoterStorageBuilder) Build() (*FeeQuoterStorage, error) {
	if b.err != nil {
		return nil, b.err
	}
	// copy to avoid future accidental mutation through the builder
	st := b.storage
	return &st, nil
}

func (s *FeeQuoterStorage) FromBinding(raw *feequoter.Storage) error {
	b := NewFeeQuoterStorageBuilder().
		WithID(raw.ID).
		WithOwnable(
			raw.Ownable.Owner,
			raw.Ownable.PendingOwner,
		).
		WithMaxFeeJuelsPerMsg(raw.MaxFeeJuelsPerMsg).
		WithLinkToken(raw.LinkToken).
		WithTokenPriceStalenessThreshold(raw.TokenPriceStalenessThreshold)

	// AllowedPriceUpdaters
	apus, err := raw.AllowedPriceUpdaters.LoadAll()
	if err != nil {
		return fmt.Errorf("error while loading AllowedPriceUpdaters: %w", err)
	}
	for _, kv := range apus {
		var w common.AddressWrap
		if err2 := tlb.LoadFromCell(&w, kv.Key); err2 != nil {
			return fmt.Errorf("error while decoding AllowedPriceUpdater key: %w", err2)
		}
		b = b.WithAllowedPriceUpdater(w.Val)
	}

	// DestChainConfigs
	dccs, err := raw.DestChainConfigs.LoadAll()
	if err != nil {
		return fmt.Errorf("error while loading DestChainConfigs: %w", err)
	}
	for _, kv := range dccs {
		selector, err2 := kv.Key.LoadUInt(64)
		if err2 != nil {
			return fmt.Errorf("error while decoding chain selector from DestChainConfigs: %w", err2)
		}

		var dcc feequoter.DestChainConfigs
		if err2 := tlb.LoadFromCell(&dcc, kv.Value); err2 != nil {
			return fmt.Errorf("error while decoding DestChainConfigs value: %w", err2)
		}

		var gas feequoter.USDPerUnitGas
		if err3 := tlb.LoadFromCell(&gas, dcc.USDPerUnitGasRef.BeginParse()); err3 != nil {
			return fmt.Errorf("error while decoding USDPerUnitGas from DestChainConfigs: %w", err3)
		}

		if gas.Timestamp > math.MaxInt64 {
			return fmt.Errorf("timestamp %d overflows int64", gas.Timestamp)
		}

		cfg := DestChainConfigs{
			Config: DestChainConfig{
				IsEnabled:                         dcc.Config.IsEnabled,
				MaxNumberOfTokensPerMsg:           dcc.Config.MaxNumberOfTokensPerMsg,
				MaxDataBytes:                      dcc.Config.MaxDataBytes,
				MaxPerMsgGasLimit:                 dcc.Config.MaxPerMsgGasLimit,
				DestGasOverhead:                   dcc.Config.DestGasOverhead,
				DestGasPerPayloadByteBase:         dcc.Config.DestGasPerPayloadByteBase,
				DestGasPerPayloadByteHigh:         dcc.Config.DestGasPerPayloadByteHigh,
				DestGasPerPayloadByteThreshold:    dcc.Config.DestGasPerPayloadByteThreshold,
				DestDataAvailabilityOverheadGas:   dcc.Config.DestDataAvailabilityOverheadGas,
				DestGasPerDataAvailabilityByte:    dcc.Config.DestGasPerDataAvailabilityByte,
				DestDataAvailabilityMultiplierBps: dcc.Config.DestDataAvailabilityMultiplierBps,
				ChainFamilySelector:               dcc.Config.ChainFamilySelector,
				DefaultTokenFeeUsdCents:           dcc.Config.DefaultTokenFeeUsdCents,
				DefaultTokenDestGasOverhead:       dcc.Config.DefaultTokenDestGasOverhead,
				DefaultTxGasLimit:                 dcc.Config.DefaultTxGasLimit,
				GasMultiplierWeiPerEth:            dcc.Config.GasMultiplierWeiPerEth,
				GasPriceStalenessThreshold:        dcc.Config.GasPriceStalenessThreshold,
				NetworkFeeUsdCents:                dcc.Config.NetworkFeeUsdCents,
			},
			USDPerUnitGas: USDPerUnitGas{
				ExecutionGasPrice:        gas.ExecutionGasPrice,
				DataAvailabilityGasPrice: gas.DataAvailabilityGasPrice,
				Timestamp:                time.Unix(int64(gas.Timestamp), 0).UTC(),
			},
		}

		b = b.WithDestChainConfig(selector, cfg)
	}

	// USDPerToken
	usdItems, err := raw.UsdPerToken.LoadAll()
	if err != nil {
		return fmt.Errorf("error while loading UsdPerToken: %w", err)
	}
	for _, kv := range usdItems {
		var token common.AddressWrap
		if err2 := tlb.LoadFromCell(&token, kv.Key); err2 != nil {
			return fmt.Errorf("error while decoding UsdPerToken key: %w", err2)
		}

		var price feequoter.TimestampedPrice
		if err3 := tlb.LoadFromCell(&price, kv.Value); err3 != nil {
			return fmt.Errorf("error while decoding UsdPerToken value: %w", err3)
		}

		b = b.WithUSDPerToken(token.Val, price.Value, time.Unix(int64(price.Timestamp), 0).UTC())
	}

	// PremiumMultiplierWeiPerEth
	pmItems, err := raw.PremiumMultiplierWeiPerEth.LoadAll()
	if err != nil {
		return fmt.Errorf("error while loading PremiumMultiplierWeiPerEth: %w", err)
	}
	for _, kv := range pmItems {
		var token common.AddressWrap
		if err2 := tlb.LoadFromCell(&token, kv.Key); err2 != nil {
			return fmt.Errorf("error while decoding PremiumMultiplier key: %w", err2)
		}

		val, err3 := kv.Value.LoadUInt(64)
		if err3 != nil {
			return fmt.Errorf("error while decoding PremiumMultiplier value: %w", err3)
		}

		b = b.WithPremiumMultiplier(token.Val, val)
	}

	built, err := b.Build()
	if err != nil {
		return err
	}

	*s = *built
	return nil
}

func (s *FeeQuoterStorage) ToBinding() (*feequoter.Storage, error) {
	st := feequoter.Storage{
		ID: s.ID,
		Ownable: ownable2step.Storage{
			Owner:        s.Ownable.Owner,
			PendingOwner: s.Ownable.PendingOwner,
		},
		MaxFeeJuelsPerMsg:            s.MaxFeeJuelsPerMsg,
		LinkToken:                    s.LinkToken,
		TokenPriceStalenessThreshold: s.TokenPriceStalenessThreshold,
	}

	// AllowedPriceUpdaters
	st.AllowedPriceUpdaters = cell.NewDict(267)
	for _, apu := range s.AllowedPriceUpdaters {
		if err := st.AllowedPriceUpdaters.Set(
			cell.BeginCell().MustStoreAddr(apu).EndCell(),
			cell.BeginCell().EndCell(),
		); err != nil {
			return nil, fmt.Errorf("error while setting AllowedPriceUpdater: %w", err)
		}
	}

	// USDPerToken
	st.UsdPerToken = cell.NewDict(267)
	for token, price := range s.USDPerToken {
		tokenAddress := address.MustParseAddr(token)

		timestamp := price.Timestamp.Unix()
		if timestamp < 0 || timestamp > math.MaxUint32 {
			return nil, fmt.Errorf("timestamp in USDPerToken %d overflows or underflows uint32", timestamp)
		}

		bindingPrice := feequoter.TimestampedPrice{
			Value:     price.Value,
			Timestamp: uint32(timestamp),
		}

		valueCell, err := tlb.ToCell(bindingPrice)
		if err != nil {
			return nil, fmt.Errorf("error while encoding UsdPerToken as cell: %w", err)
		}

		if err := st.UsdPerToken.Set(
			cell.BeginCell().MustStoreAddr(tokenAddress).EndCell(),
			valueCell,
		); err != nil {
			return nil, fmt.Errorf("error while setting UsdPerToken: %w", err)
		}
	}

	// PremiumMultiplierWeiPerEth
	st.PremiumMultiplierWeiPerEth = cell.NewDict(267)
	for token, premiumMultiplier := range s.PremiumMultiplierWeiPerEthByToken {
		tokenAddress := address.MustParseAddr(token)

		if err := st.PremiumMultiplierWeiPerEth.Set(
			cell.BeginCell().MustStoreAddr(tokenAddress).EndCell(),
			cell.BeginCell().MustStoreUInt(premiumMultiplier, 64).EndCell(),
		); err != nil {
			return nil, fmt.Errorf("error while setting PremiumMultiplierWeiPerEth: %w", err)
		}
	}

	// DestChainConfigs
	st.DestChainConfigs = cell.NewDict(64)
	for selector, chainConfig := range s.DestChainConfigsByChainSelector {
		timestamp := chainConfig.USDPerUnitGas.Timestamp.Unix()
		if timestamp < 0 {
			return nil, fmt.Errorf("timestamp in USDPerUnitGas %d is lower than 0", timestamp)
		}

		usdPerUnitGas := feequoter.USDPerUnitGas{
			ExecutionGasPrice:        chainConfig.USDPerUnitGas.ExecutionGasPrice,
			DataAvailabilityGasPrice: chainConfig.USDPerUnitGas.DataAvailabilityGasPrice,
			Timestamp:                uint64(timestamp),
		}

		usdPerUnitGasCell, err := tlb.ToCell(usdPerUnitGas)
		if err != nil {
			return nil, fmt.Errorf("error while encoding USDPerUnitGas as cell: %w", err)
		}

		destChainConfig := feequoter.DestChainConfigs{
			Config: feequoter.DestChainConfig{
				IsEnabled:                         chainConfig.Config.IsEnabled,
				MaxNumberOfTokensPerMsg:           chainConfig.Config.MaxNumberOfTokensPerMsg,
				MaxDataBytes:                      chainConfig.Config.MaxDataBytes,
				MaxPerMsgGasLimit:                 chainConfig.Config.MaxPerMsgGasLimit,
				DestGasOverhead:                   chainConfig.Config.DestGasOverhead,
				DestGasPerPayloadByteBase:         chainConfig.Config.DestGasPerPayloadByteBase,
				DestGasPerPayloadByteHigh:         chainConfig.Config.DestGasPerPayloadByteHigh,
				DestGasPerPayloadByteThreshold:    chainConfig.Config.DestGasPerPayloadByteThreshold,
				DestDataAvailabilityOverheadGas:   chainConfig.Config.DestDataAvailabilityOverheadGas,
				DestGasPerDataAvailabilityByte:    chainConfig.Config.DestGasPerDataAvailabilityByte,
				DestDataAvailabilityMultiplierBps: chainConfig.Config.DestDataAvailabilityMultiplierBps,
				ChainFamilySelector:               chainConfig.Config.ChainFamilySelector,
				DefaultTokenFeeUsdCents:           chainConfig.Config.DefaultTokenFeeUsdCents,
				DefaultTokenDestGasOverhead:       chainConfig.Config.DefaultTokenDestGasOverhead,
				DefaultTxGasLimit:                 chainConfig.Config.DefaultTxGasLimit,
				GasMultiplierWeiPerEth:            chainConfig.Config.GasMultiplierWeiPerEth,
				GasPriceStalenessThreshold:        chainConfig.Config.GasPriceStalenessThreshold,
				NetworkFeeUsdCents:                chainConfig.Config.NetworkFeeUsdCents,
			},
			USDPerUnitGasRef: usdPerUnitGasCell,
		}

		destChainConfigCell, err := tlb.ToCell(destChainConfig)
		if err != nil {
			return nil, fmt.Errorf("error while encoding DestChainConfigs as cell: %w", err)
		}

		if err := st.DestChainConfigs.Set(
			cell.BeginCell().MustStoreUInt(selector, 64).EndCell(),
			destChainConfigCell,
		); err != nil {
			return nil, fmt.Errorf("error while encoding DestChainConfigs as cell: %w", err)
		}
	}

	return &st, nil
}

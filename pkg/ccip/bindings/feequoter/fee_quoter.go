package feequoter

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type Storage struct {
	Ownable                      common.Ownable2Step `tlb:"."`
	MaxFeeJuelsPerMsg            *big.Int            `tlb:"## 96"`
	LinkToken                    *address.Address    `tlb:"addr"`
	TokenPriceStalenessThreshold uint64              `tlb:"## 64"`
	UsdPerToken                  *cell.Dictionary    `tlb:"dict 267"`
	PremiumMultiplierWeiPerEth   *cell.Dictionary    `tlb:"dict 267"`
	DestChainConfigs             *cell.Dictionary    `tlb:"dict 64"`
	KeyLen                       uint16              `tlb:"## 16"`
}

type DestChainConfig struct {
	IsEnabled                         bool   `tlb:"bool"`
	MaxNumberOfTokensPerMsg           uint16 `tlb:"## 16"`
	MaxDataBytes                      uint32 `tlb:"## 32"`
	MaxPerMsgGasLimit                 uint32 `tlb:"## 32"`
	DestGasOverhead                   uint32 `tlb:"## 32"`
	DestGasPerPayloadByteBase         uint8  `tlb:"## 8"`
	DestGasPerPayloadByteHigh         uint8  `tlb:"## 8"`
	DestGasPerPayloadByteThreshold    uint16 `tlb:"## 16"`
	DestDataAvailabilityOverheadGas   uint32 `tlb:"## 32"`
	DestGasPerDataAvailabilityByte    uint16 `tlb:"## 16"`
	DestDataAvailabilityMultiplierBps uint16 `tlb:"## 16"`
	ChainFamilySelector               uint32 `tlb:"## 32"`
	EnforceOutOfOrder                 bool   `tlb:"bool"`
	DefaultTokenFeeUsdCents           uint16 `tlb:"## 16"`
	DefaultTokenDestGasOverhead       uint32 `tlb:"## 32"`
	DefaultTxGasLimit                 uint32 `tlb:"## 32"`
	GasMultiplierWeiPerEth            uint64 `tlb:"## 64"`
	GasPriceStalenessThreshold        uint32 `tlb:"## 32"`
	NetworkFeeUsdCents                uint32 `tlb:"## 32"`
}

func (c *DestChainConfig) FromResult(result *ton.ExecutionResult) error {
	isEnabledInt, err := result.Int(0)
	if err != nil {
		return err
	}
	isEnabled := isEnabledInt.Cmp(big.NewInt(-1)) == 0
	maxNumberOfTokensPerMsg, err := result.Int(1)
	if err != nil {
		return err
	}
	maxDataBytes, err := result.Int(2)
	if err != nil {
		return err
	}
	maxPerMsgGasLimit, err := result.Int(3)
	if err != nil {
		return err
	}
	destGasOverhead, err := result.Int(4)
	if err != nil {
		return err
	}
	destGasPerPayloadByteBase, err := result.Int(5)
	if err != nil {
		return err
	}
	destGasPerPayloadByteHigh, err := result.Int(6)
	if err != nil {
		return err
	}
	destGasPerPayloadByteThreshold, err := result.Int(7)
	if err != nil {
		return err
	}
	destDataAvailabilityOverheadGas, err := result.Int(8)
	if err != nil {
		return err
	}
	destGasPerDataAvailabilityByte, err := result.Int(9)
	if err != nil {
		return err
	}
	destDataAvailabilityMultiplierBps, err := result.Int(10)
	if err != nil {
		return err
	}
	chainFamilySelector, err := result.Int(11)
	if err != nil {
		return err
	}
	enforceOutOfOrderInt, err := result.Int(12)
	if err != nil {
		return err
	}
	enforceOutOfOrder := enforceOutOfOrderInt.Cmp(big.NewInt(-1)) == 0
	defaultTokenFeeUsdCents, err := result.Int(13)
	if err != nil {
		return err
	}
	defaultTokenDestGasOverhead, err := result.Int(14)
	if err != nil {
		return err
	}
	defaultTxGasLimit, err := result.Int(15)
	if err != nil {
		return err
	}
	gasMultiplierWeiPerEth, err := result.Int(16)
	if err != nil {
		return err
	}
	gasPriceStalenessThreshold, err := result.Int(17)
	if err != nil {
		return err
	}
	networkFeeUsdCents, err := result.Int(18)
	if err != nil {
		return err
	}
	*c = DestChainConfig{
		IsEnabled:                         isEnabled,
		MaxNumberOfTokensPerMsg:           uint16(maxNumberOfTokensPerMsg.Uint64()),           //nolint:gosec // G115
		MaxDataBytes:                      uint32(maxDataBytes.Uint64()),                      //nolint:gosec // G115
		MaxPerMsgGasLimit:                 uint32(maxPerMsgGasLimit.Uint64()),                 //nolint:gosec // G115
		DestGasOverhead:                   uint32(destGasOverhead.Uint64()),                   //nolint:gosec // G115
		DestGasPerPayloadByteBase:         uint8(destGasPerPayloadByteBase.Uint64()),          //nolint:gosec // G115
		DestGasPerPayloadByteHigh:         uint8(destGasPerPayloadByteHigh.Uint64()),          //nolint:gosec // G115
		DestGasPerPayloadByteThreshold:    uint16(destGasPerPayloadByteThreshold.Uint64()),    //nolint:gosec // G115
		DestDataAvailabilityOverheadGas:   uint32(destDataAvailabilityOverheadGas.Uint64()),   //nolint:gosec // G115
		DestGasPerDataAvailabilityByte:    uint16(destGasPerDataAvailabilityByte.Uint64()),    //nolint:gosec // G115
		DestDataAvailabilityMultiplierBps: uint16(destDataAvailabilityMultiplierBps.Uint64()), //nolint:gosec // G115
		ChainFamilySelector:               uint32(chainFamilySelector.Uint64()),               //nolint:gosec // G115
		EnforceOutOfOrder:                 enforceOutOfOrder,
		DefaultTokenFeeUsdCents:           uint16(defaultTokenFeeUsdCents.Uint64()),     //nolint:gosec // G115
		DefaultTokenDestGasOverhead:       uint32(defaultTokenDestGasOverhead.Uint64()), //nolint:gosec // G115
		DefaultTxGasLimit:                 uint32(defaultTxGasLimit.Uint64()),           //nolint:gosec // G115
		GasMultiplierWeiPerEth:            gasMultiplierWeiPerEth.Uint64(),
		GasPriceStalenessThreshold:        uint32(gasPriceStalenessThreshold.Uint64()), //nolint:gosec // G115
		NetworkFeeUsdCents:                uint32(networkFeeUsdCents.Uint64()),         //nolint:gosec // G115
	}
	return nil
}

type TokenTransferFeeConfig struct {
	IsEnabled         bool   `tlb:"bool"`
	MinFeeUsdCents    uint32 `tlb:"## 32"`
	MaxFeeUsdCents    uint32 `tlb:"## 32"`
	DeciBps           uint16 `tlb:"## 16"`
	DestGasOverhead   uint32 `tlb:"## 32"`
	DestBytesOverhead uint32 `tlb:"## 32"`
}

type TimestampedPrice struct {
	Value     *big.Int `tlb:"## 224"`
	Timestamp uint64   `tlb:"## 64"`
}

// TODO: we can't parse ton.ExecutionResult via tlb, implement as a tlb feature upstream
func (p *TimestampedPrice) FromResult(result *ton.ExecutionResult) error {
	value, err := result.Int(0)
	if err != nil {
		return err
	}
	timestamp, err := result.Int(1)
	if err != nil {
		return err
	}

	*p = TimestampedPrice{
		Value:     value,
		Timestamp: timestamp.Uint64(),
	}
	return nil
}

type TokenPriceUpdate struct {
	SourceToken *address.Address `tlb:"addr"`
	UsdPerToken *big.Int         `tlb:"## 224"`
}

type GasPriceUpdate struct {
	DestChainSelector        uint64   `tlb:"## 64"`
	ExecutionGasPrice        *big.Int `tlb:"## 112"`
	DataAvailabilityGasPrice *big.Int `tlb:"## 112"`
}

type FeeToken struct {
	PremiumMultiplierWeiPerEth uint64 `tlb:"## 64"`
}

type StaticConfig struct {
	MaxFeeJuelsPerMsg  *big.Int
	LinkToken          *address.Address
	StalenessThreshold uint32
}

func (c *StaticConfig) FromResult(result *ton.ExecutionResult) error {
	maxFeeJuelsPerMsg, err := result.Int(0)
	if err != nil {
		return err
	}
	linkTokenAddressSlice, err := result.Slice(1)
	if err != nil {
		return err
	}
	linkTokenAddress, err := linkTokenAddressSlice.LoadAddr()
	if err != nil {
		return err
	}
	tokenPriceStalenessThreshold, err := result.Int(2)
	if err != nil {
		return err
	}
	*c = StaticConfig{
		MaxFeeJuelsPerMsg:  maxFeeJuelsPerMsg,
		LinkToken:          linkTokenAddress,
		StalenessThreshold: uint32(tokenPriceStalenessThreshold.Uint64()), //nolint:gosec // G115
	}
	return nil
}

// Methods

type UpdatePrices struct {
	_           tlb.Magic                          `tlb:"#20000001"` //nolint:revive // Ignore opcode tag
	TokenPrices common.SnakeData[TokenPriceUpdate] `tlb:"^"`
	GasPrices   common.SnakeData[GasPriceUpdate]   `tlb:"^"`
}

type UpdateFeeTokens struct {
	_      tlb.Magic                          `tlb:"#20000002"` //nolint:revive // Ignore opcode tag
	Add    bool                               // TODO
	Remove common.SnakeData[*address.Address] `tlb:"^"`
}

type UpdateTokenTransferFeeConfig struct {
	_      tlb.Magic `tlb:"#20000003"` //nolint:revive // Ignore opcode tag
	Add    map[*address.Address]TokenTransferFeeConfig
	Remove []*address.Address `tlb:"addr"`
}
type UpdateTokenTransferFeeConfigs struct{}

type UpdateDestChainConfig struct {
	DestinationChainSelector uint64          `tlb:"## 64"`
	DestChainConfig          DestChainConfig `tlb:"."`
}

type UpdateDestChainConfigs struct {
	_      tlb.Magic             `tlb:"#20000004"` //nolint:revive // Ignore opcode tag
	Update UpdateDestChainConfig `tlb:"."`
	// Updates common.SnakeData[UpdateDestChainConfig] `tlb:"^"`
}

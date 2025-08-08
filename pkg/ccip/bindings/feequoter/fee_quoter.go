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

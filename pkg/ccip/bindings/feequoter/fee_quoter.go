package feequoter

import (
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type Storage struct {
	Ownable                      common.Ownable2Step `tlb:"^"`
	MaxFeeJuelsPerMsg            *big.Int            `tlb:"## 96"`
	LinkToken                    *address.Address    `tlb:"addr"`
	TokenPriceStalenessThreshold uint64              `tlb:"## 64"`
	UsdPerToken                  *cell.Dictionary    `tlb:"dict 267"`
	PremiumMultiplierWeiPerEth   *cell.Dictionary    `tlb:"dict 267"`
	DestChainConfigs             *cell.Dictionary    `tlb:"dict 64"`
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

// Methods

type UpdatePrices struct{}
type UpdateFeeTokens struct{}

type UpdateTokenTransferFeeConfig struct {
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

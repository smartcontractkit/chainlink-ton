package feequoter

import (
	"context"
	"math/big"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	ccipcommon "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

const (
	tokenPriceGetter               = "tokenPrice"
	StaticConfigGetter             = "staticConfig"
	DestinationChainGasPriceGetter = "destinationChainGasPrice"
)

// Fee Quoter opcodes
const (
	OpcodeUpdatePrices                  = 0x20000001
	OpcodeUpdateFeeTokens               = 0xD0984986
	OpcodeUpdateTokenTransferFeeConfigs = 0xB2826316
	OpcodeUpdateDestChainConfigs        = 0x29950BAA
	OpcodeFeeQuoterGetValidatedFee      = 0x7496FF56
	OpcodeFeeQuoterAddPriceUpdater      = 0x71DF848A
	OpcodeFeeQuoterRemovePriceUpdater   = 0x5DFBB1BC
)

//go:generate go run golang.org/x/tools/cmd/stringer@v0.38.0 -type=ExitCode
type ExitCode tvm.ExitCode

var ExitCodeCodec tvm.ExitCodeCodecInt[ExitCode] = ExitCode(tvm.ExitCode(-1))

func (ExitCode) NewFrom(ec tvm.ExitCode) (ExitCode, error) {
	const (
		ecMin = int32(ErrorUnsupportedChainFamilySelector)
		ecMax = int32(ErrorMessageFeeTooHigh)
	)
	return tvm.NewExitCodeInRange(ExitCode(ec), ecMin, ecMax)
}

const (
	ErrorUnsupportedChainFamilySelector ExitCode = ExitCode(24800 + iota)
	ErrorGasLimitTooHigh
	ExtraArgOutOfOrderExecutionMustBeTrue
	ErrorInvalidExtraArgsData
	ErrorUnsupportedNumberOfTokens
	ErrorInvalidSuiReceiverAddress
	ErrorInvalidTokenReceiver
	ErrorTooManySuiExtraArgsReceiverObjectIDs
	ErrorMsgDataTooLarge
	ErrorStaleGasPrice
	ErrorDestChainNotEnabled
	ErrorFeeTokenNotSupported
	ErrorInvalidMsgData
	ErrorTokenNotSupported
	ErrorUnknownDestChainSelector
	ErrorInsufficientFee
	ErrorTokenTransfersNotSupported
	ErrorUnauthorizedPriceUpdater
	// Overflow protection errors
	ErrorExecutionCostOverflow
	ErrorPremiumFeeOverflow
	ErrorDataAvailabilityCostOverflow
	ErrorFeeCalculationOverflow
	ErrorTokenPriceTooLow
	ErrorFeeOverflow
	ErrorMessageFeeTooHigh
)

type Storage struct {
	ID                           uint32                  `tlb:"## 32"`
	Ownable                      ccipcommon.Ownable2Step `tlb:"."`
	AllowedPriceUpdaters         *cell.Dictionary        `tlb:"dict 267"`
	MaxFeeJuelsPerMsg            *big.Int                `tlb:"## 96"`
	LinkToken                    *address.Address        `tlb:"addr"`
	TokenPriceStalenessThreshold uint64                  `tlb:"## 64"`
	UsdPerToken                  *cell.Dictionary        `tlb:"dict 267"`
	PremiumMultiplierWeiPerEth   *cell.Dictionary        `tlb:"dict 267"`
	DestChainConfigs             *cell.Dictionary        `tlb:"dict 64"`
}

type DestChainConfigs struct {
	Config                  DestChainConfig  `tlb:"."`        // inline struct
	USDPerUnitGasRef        *cell.Cell       `tlb:"^"`        // ^Cell<GasPrice>
	TokenTransferFeeConfigs *cell.Dictionary `tlb:"dict 267"` // map<address, TokenTransferFeeConfig>
}

type USDPerUnitGas struct {
	ExecutionGasPrice        *big.Int `tlb:"## 112"`
	DataAvailabilityGasPrice *big.Int `tlb:"## 112"`
	Timestamp                uint64   `tlb:"## 64"`
}

func (u *USDPerUnitGas) UnmarshalResult(result *ton.ExecutionResult) error {
	c, err := result.Cell(0)
	if err != nil {
		return err
	}
	return tlb.LoadFromCell(u, c.BeginParse())
}

func (u *USDPerUnitGas) FetchResult(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddr *address.Address, destChainSelector []interface{}) error {
	return ccipcommon.FetchResultHelper(ctx, client, block, contractAddr, DestinationChainGasPriceGetter, destChainSelector, u)
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
	DefaultTokenFeeUsdCents           uint16 `tlb:"## 16"`
	DefaultTokenDestGasOverhead       uint32 `tlb:"## 32"`
	DefaultTxGasLimit                 uint32 `tlb:"## 32"`
	GasMultiplierWeiPerEth            uint64 `tlb:"## 64"`
	GasPriceStalenessThreshold        uint32 `tlb:"## 32"`
	NetworkFeeUsdCents                uint32 `tlb:"## 32"`
}

func (c *DestChainConfig) UnmarshalResult(result *ton.ExecutionResult) error {
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
	defaultTokenFeeUsdCents, err := result.Int(12)
	if err != nil {
		return err
	}
	defaultTokenDestGasOverhead, err := result.Int(13)
	if err != nil {
		return err
	}
	defaultTxGasLimit, err := result.Int(14)
	if err != nil {
		return err
	}
	gasMultiplierWeiPerEth, err := result.Int(15)
	if err != nil {
		return err
	}
	gasPriceStalenessThreshold, err := result.Int(16)
	if err != nil {
		return err
	}
	networkFeeUsdCents, err := result.Int(17)
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
		DefaultTokenFeeUsdCents:           uint16(defaultTokenFeeUsdCents.Uint64()),           //nolint:gosec // G115
		DefaultTokenDestGasOverhead:       uint32(defaultTokenDestGasOverhead.Uint64()),       //nolint:gosec // G115
		DefaultTxGasLimit:                 uint32(defaultTxGasLimit.Uint64()),                 //nolint:gosec // G115
		GasMultiplierWeiPerEth:            gasMultiplierWeiPerEth.Uint64(),
		GasPriceStalenessThreshold:        uint32(gasPriceStalenessThreshold.Uint64()), //nolint:gosec // G115
		NetworkFeeUsdCents:                uint32(networkFeeUsdCents.Uint64()),         //nolint:gosec // G115
	}
	return nil
}

func (c *DestChainConfig) FetchResult(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddr *address.Address, destChainSelector []interface{}) error {
	return ccipcommon.FetchResultHelper(ctx, client, block, contractAddr, ccipcommon.DestChainConfigGetter, destChainSelector, c)
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
	Timestamp uint32   `tlb:"## 32"`
}

func (p *TimestampedPrice) UnmarshalResult(result *ton.ExecutionResult) error {
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
		Timestamp: uint32(timestamp.Uint64()), //nolint:gosec // G115
	}
	return nil
}

func (p *TimestampedPrice) FetchResult(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddr *address.Address, opts []interface{}) error {
	return ccipcommon.FetchResultHelper(ctx, client, block, contractAddr, tokenPriceGetter, opts, p)
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

// Generic wrapper for fee quoter messages with context
type GetValidatedFee struct {
	_       tlb.Magic  `tlb:"#7496FF56"` //nolint:revive // Ignore opcode tag
	Msg     *cell.Cell `tlb:"^"`         // Cell containing the CCIPSend message
	Context *cell.Cell `tlb:"maybe ^"`   // Cell containing context
}

// --- Response from GetValidatedFee ---
type MessageValidated struct {
	_       tlb.Magic  `tlb:"#1fa60374"` //nolint:revive // Ignore opcode tag
	Fee     Fee        `tlb:"."`
	Msg     *cell.Cell `tlb:"^"`       // Original message
	Context *cell.Cell `tlb:"maybe ^"` // Original context
}

type Fee struct {
	FeeTokenAmount *tlb.Coins `tlb:"."`     // fee value in fee token
	FeeValueJuels  *big.Int   `tlb:"## 96"` // fee value in juels
}

type MessageValidationFailed struct {
	_         tlb.Magic  `tlb:"#bcf0ab0f"` //nolint:revive // Ignore opcode tag
	ErrorCode *big.Int   `tlb:"## 256"`
	Msg       *cell.Cell `tlb:"^"`       // Original message,
	Context   *cell.Cell `tlb:"maybe ^"` // Original context
}

type AddPriceUpdater struct {
	_            tlb.Magic        `tlb:"#71DF848A"` //nolint:revive // Ignore opcode tag
	PriceUpdater *address.Address `tlb:"addr"`
}

type RemovePriceUpdater struct {
	_            tlb.Magic        `tlb:"#5DFBB1BC"` //nolint:revive // Ignore opcode tag
	PriceUpdater *address.Address `tlb:"addr"`
}

type UpdatePrices struct {
	_              tlb.Magic                              `tlb:"#20000001"` //nolint:revive // Ignore opcode tag
	TokenPrices    ccipcommon.SnakeData[TokenPriceUpdate] `tlb:"^"`
	GasPrices      ccipcommon.SnakeData[GasPriceUpdate]   `tlb:"^"`
	SendExcessesTo *address.Address                       `tlb:"maybe addr"`
}

type UpdateFeeTokens struct {
	_      tlb.Magic                              `tlb:"#D0984986"` //nolint:revive // Ignore opcode tag
	Add    *cell.Dictionary                       `tlb:"dict 267"`
	Remove ccipcommon.SnakeData[*address.Address] `tlb:"^"`
}

type UpdateTokenTransferFeeConfig struct {
	_      tlb.Magic `tlb:"#B2826316"` //nolint:revive // Ignore opcode tag
	Add    map[*address.Address]TokenTransferFeeConfig
	Remove []*address.Address `tlb:"addr"`
}
type UpdateTokenTransferFeeConfigs struct {
	_ tlb.Magic `tlb:"#B2826316"` //nolint:revive // Ignore opcode tag
}

type UpdateDestChainConfig struct {
	DestinationChainSelector uint64          `tlb:"## 64"`
	DestChainConfig          DestChainConfig `tlb:"."`
}

type UpdateDestChainConfigs struct {
	_       tlb.Magic                                   `tlb:"#29950BAA"` //nolint:revive // Ignore opcode tag
	Updates ccipcommon.SnakeData[UpdateDestChainConfig] `tlb:"^"`
}

// binding types that supports FetchResult interface with rpc client

type StaticConfig struct {
	MaxFeeJuelsPerMsg  *big.Int
	LinkToken          *address.Address
	StalenessThreshold uint32
}

func (s *StaticConfig) UnmarshalResult(result *ton.ExecutionResult) error {
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
	*s = StaticConfig{
		MaxFeeJuelsPerMsg:  maxFeeJuelsPerMsg,
		LinkToken:          linkTokenAddress,
		StalenessThreshold: uint32(tokenPriceStalenessThreshold.Uint64()), //nolint:gosec // G115
	}
	return nil
}

func (s *StaticConfig) FetchResult(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, contractAddr *address.Address, _ []interface{}) error {
	return ccipcommon.FetchResultHelper(ctx, client, block, contractAddr, StaticConfigGetter, nil, s)
}

package feequoter

import (
	"context"
	"math/big"
	"runtime"
	"sync"

	"github.com/samber/lo"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"golang.org/x/sync/errgroup"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// Fee Quoter opcodes
const (
	OpcodeUpdatePrices                  = 0xde852b1b
	OpcodeUpdateFeeTokens               = 0xD0984986
	OpcodeUpdateTokenTransferFeeConfigs = 0xB2826316
	OpcodeUpdateDestChainConfigs        = 0x2d2410f6
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
	ErrorUnsupportedChainFamilySelector ExitCode = ExitCode(34400 + iota)
	ErrorGasLimitTooHigh
	ExtraArgOutOfOrderExecutionMustBeTrue
	ErrorInvalidExtraArgsData
	ErrorUnsupportedNumberOfTokens
	ErrorInvalidEVMReceiverAddress
	ErrorInvalid32ByteReceiverAddress
	ErrorInvalidSuiReceiverAddress
	ErrorInvalidSVMReceiverAddress
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

// Registry method names
const (
	DestChainsGetter               = "destChainSelectors"
	tokenPriceGetter               = "tokenPrice"
	staticConfigGetter             = "staticConfig"
	destChainConfigGetter          = "destChainConfig"
	destinationChainGasPriceGetter = "destinationChainGasPrice"
)

type Storage struct {
	ID                           uint32               `tlb:"## 32"`
	Ownable                      ownable2step.Storage `tlb:"."`
	AllowedPriceUpdaters         *cell.Dictionary     `tlb:"dict 267"`
	MaxFeeJuelsPerMsg            *big.Int             `tlb:"## 96"`
	LinkToken                    *address.Address     `tlb:"addr"`
	TokenPriceStalenessThreshold uint32               `tlb:"## 32"`
	UsdPerToken                  *cell.Dictionary     `tlb:"dict 267"`
	PremiumMultiplierWeiPerEth   *cell.Dictionary     `tlb:"dict 267"`
	DestChainConfigs             *cell.Dictionary     `tlb:"dict 64"`
}

// DestChainConfigs represents the full on-chain DestChainConfig struct from the FeeQuoter contract.
// See contracts/contracts/ccip/fee_quoter/types.tolk for the on-chain definition.
// Note the naming: this Go type uses plural "Configs" to distinguish from DestChainConfig above.
type DestChainConfigs struct {
	Config                  DestChainConfig  `tlb:"."`        // inline struct (FeeQuoterDestChainConfig on-chain)
	USDPerUnitGasRef        *cell.Cell       `tlb:"^"`        // ^Cell<GasPrice>
	TokenTransferFeeConfigs *cell.Dictionary `tlb:"dict 267"` // map<address, TokenTransferFeeConfig>
}

type USDPerUnitGas struct {
	ExecutionGasPrice        *big.Int `tlb:"## 112"`
	DataAvailabilityGasPrice *big.Int `tlb:"## 112"`
	Timestamp                uint64   `tlb:"## 64"`
}

// Deprecated: Use GetDestinationChainGasPrice getter instead.
func (u *USDPerUnitGas) UnmarshalResult(result *ton.ExecutionResult) error {
	res, err := GetDestinationChainGasPrice.Decoder.Decode(result)
	if err != nil {
		return err
	}
	*u = res
	return nil
}

// Deprecated: Use GetDestinationChainGasPrice getter instead.
func (u *USDPerUnitGas) GetterMethodName() string {
	return destinationChainGasPriceGetter
}

// DestChainConfig represents the FeeQuoterDestChainConfig fields from the on-chain FeeQuoter contract.
//
// NOTE: This Go type is named "DestChainConfig" but corresponds to the on-chain "FeeQuoterDestChainConfig"
// struct (see contracts/contracts/ccip/fee_quoter/types.tolk). The on-chain "DestChainConfig" is a larger
// struct that wraps FeeQuoterDestChainConfig along with usdPerUnitGas and tokenTransferFeeConfigs fields.
// The full on-chain struct is represented by DestChainConfigs (plural) in this package.
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

// Deprecated: Use GetDestChainConfig getter instead.
func (c *DestChainConfig) UnmarshalResult(result *ton.ExecutionResult) error {
	res, err := GetDestChainConfig.Decoder.Decode(result)
	if err != nil {
		return err
	}
	*c = res
	return nil
}

// Deprecated: Use GetDestChainConfig getter instead.
func (c *DestChainConfig) GetterMethodName() string {
	return destChainConfigGetter
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

// Deprecated: Use GetTokenPrice getter instead.
func (p *TimestampedPrice) UnmarshalResult(result *ton.ExecutionResult) error {
	res, err := GetTokenPrice.Decoder.Decode(result)
	if err != nil {
		return err
	}
	*p = res
	return nil
}

// Deprecated: Use GetTokenPrice getter instead.
func (p *TimestampedPrice) GetterMethodName() string {
	return tokenPriceGetter
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
// NOTE: Context is T=RemainingBitsAndRefs on-chain, meaning the remaining bits/refs
// are written inline with no presence bit and no ref cell.
type GetValidatedFee struct {
	_       tlb.Magic  `tlb:"#7496FF56" json:"-"` //nolint:revive // Ignore opcode tag
	Msg     *cell.Cell `tlb:"^"`                  // Cell containing the CCIPSend message
	Context *cell.Cell `tlb:"."`                  // Remaining bits/refs written inline
}

// --- Response from GetValidatedFee ---
// NOTE: Context is T=RemainingBitsAndRefs on-chain, meaning the remaining bits/refs
// are written inline with no presence bit and no ref cell.
type MessageValidated struct {
	_       tlb.Magic  `tlb:"#1fa60374" json:"-"` //nolint:revive // Ignore opcode tag
	Fee     Fee        `tlb:"."`
	Msg     *cell.Cell `tlb:"^"` // Original message
	Context *cell.Cell `tlb:"."` // Remaining bits/refs written inline
}

type Fee struct {
	FeeTokenAmount *tlb.Coins `tlb:"."`     // fee value in fee token
	FeeValueJuels  *big.Int   `tlb:"## 96"` // fee value in juels
}

// NOTE: Context is T=RemainingBitsAndRefs on-chain, meaning the remaining bits/refs
// are written inline with no presence bit and no ref cell.
type MessageValidationFailed struct {
	_         tlb.Magic  `tlb:"#bcf0ab0f" json:"-"` //nolint:revive // Ignore opcode tag
	ErrorCode *big.Int   `tlb:"## 256"`
	Msg       *cell.Cell `tlb:"^"` // Original message
	Context   *cell.Cell `tlb:"."` // Remaining bits/refs written inline
}

type AddPriceUpdater struct {
	_            tlb.Magic        `tlb:"#71DF848A" json:"-"` //nolint:revive // Ignore opcode tag
	PriceUpdater *address.Address `tlb:"addr"`
}

type RemovePriceUpdater struct {
	_            tlb.Magic        `tlb:"#5DFBB1BC" json:"-"` //nolint:revive // Ignore opcode tag
	PriceUpdater *address.Address `tlb:"addr"`
}

type UpdatePrices struct {
	_              tlb.Magic                           `tlb:"#de852b1b" json:"-"` //nolint:revive // Ignore opcode tag
	TokenPrices    common.SnakedCell[TokenPriceUpdate] `tlb:"^"`
	GasPrices      common.SnakedCell[GasPriceUpdate]   `tlb:"^"`
	SendExcessesTo *address.Address                    `tlb:"addr"`
}

type UpdateFeeTokens struct {
	_      tlb.Magic                             `tlb:"#D0984986" json:"-"` //nolint:revive // Ignore opcode tag
	Add    *cell.Dictionary                      `tlb:"dict 267"`
	Remove common.SnakedCell[common.AddressWrap] `tlb:"^"`
}

// UpdateTokenTransferFeeConfig is a value type stored in a dictionary, NOT a message.
// It represents per-destination-chain token transfer fee config updates.
type UpdateTokenTransferFeeConfig struct {
	Add    *tlbe.Dict[common.AddressWrap, TokenTransferFeeConfig] `tlb:"."`
	Remove common.SnakedCell[common.AddressWrap]                  `tlb:"^"`
}

// UpdateTokenTransferFeeConfigs is the message type for updating token transfer fee configs.
type UpdateTokenTransferFeeConfigs struct {
	_       tlb.Magic                                        `tlb:"#B2826316" json:"-"` //nolint:revive // Ignore opcode tag
	Updates *tlbe.Dict[uint64, UpdateTokenTransferFeeConfig] `tlb:"."`
}

type UpdateDestChainConfig struct {
	DestinationChainSelector uint64          `tlb:"## 64"`
	DestChainConfig          DestChainConfig `tlb:"."`
}

type UpdateDestChainConfigs struct {
	_       tlb.Magic                                `tlb:"#2d2410f6" json:"-"` //nolint:revive // Ignore opcode tag
	Updates common.SnakedCell[UpdateDestChainConfig] `tlb:"^"`
}

var TLBs = tvm.MustNewTLBMap([]any{
	GetValidatedFee{},
	MessageValidated{},
	MessageValidationFailed{},
	AddPriceUpdater{},
	RemovePriceUpdater{},
	UpdatePrices{},
	UpdateFeeTokens{},
	UpdateTokenTransferFeeConfigs{},
	UpdateDestChainConfigs{},
}).MustWithStorageType(Storage{})

// binding types that supports FetchResult interface with rpc client

type StaticConfig struct {
	MaxFeeJuelsPerMsg  *big.Int
	LinkToken          *address.Address
	StalenessThreshold uint32
}

// Deprecated: Use GetStaticConfig getter instead.
func (s *StaticConfig) UnmarshalResult(result *ton.ExecutionResult) error {
	res, err := GetStaticConfig.Decoder.Decode(result)
	if err != nil {
		return err
	}
	*s = res
	return nil
}

// Deprecated: Use GetStaticConfig getter instead.
func (s *StaticConfig) GetterMethodName() string {
	return staticConfigGetter
}

// DestChainConfigMap represents a map of destination chain selectors to their configurations.
// This type aligns with the on-chain data structure for destination chain configs.
type DestChainConfigMap map[uint64]DestChainConfig

// Fetch retrieves all destination chain configurations from the fee quoter contract.
func (d *DestChainConfigMap) Fetch(ctx context.Context, client ton.APIClientWrapped, block *ton.BlockIDExt, feeQuoter *address.Address) error {
	result, err := client.RunGetMethod(ctx, block, feeQuoter, DestChainsGetter)
	if err != nil {
		return err
	}

	selectorsBigInt, err := parser.ParseLispTuple[*big.Int](result.AsTuple())
	if err != nil {
		return err
	}
	selectorSlice := lo.Map(selectorsBigInt, func(x *big.Int, _ int) uint64 { return x.Uint64() })
	eg, egCtx := errgroup.WithContext(ctx)

	var lock sync.Mutex
	eg.SetLimit(runtime.NumCPU())
	output := make(map[uint64]DestChainConfig)
	for _, dest := range selectorSlice {
		eg.Go(func() error {
			cfg, cErr := tvm.CallGetter(egCtx, client, block, feeQuoter, GetDestChainConfig, dest)
			if cErr != nil {
				return cErr
			}

			lock.Lock()
			output[dest] = cfg
			lock.Unlock()

			return nil
		})
	}

	if err = eg.Wait(); err != nil {
		return err
	}

	*d = output
	return nil
}

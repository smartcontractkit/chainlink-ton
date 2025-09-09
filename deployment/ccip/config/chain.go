package config

import (
	"encoding/binary"
	"math/big"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/xssnick/tonutils-go/address"

	evm_fee_quoter "github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/fee_quoter"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	ton_fee_quoter "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
)

const (
	// https://github.com/smartcontractkit/chainlink/blob/1423e2581e8640d9e5cd06f745c6067bb2893af2/contracts/src/v0.8/ccip/libraries/Internal.sol#L275-L279
	/*
				```Solidity
					// bytes4(keccak256("CCIP ChainFamilySelector EVM"))
					bytes4 public constant CHAIN_FAMILY_SELECTOR_EVM = 0x2812d52c;
					// bytes4(keccak256("CCIP ChainFamilySelector SVM"));
		  		bytes4 public constant CHAIN_FAMILY_SELECTOR_SVM = 0x1e10bdc4;
				```
	*/
	EVMFamilySelector   uint32 = 0x2812d52c
	SVMFamilySelector   uint32 = 0x1e10bdc4
	AptosFamilySelector uint32 = 0xac77ffec
	TVMFamilySelector   uint32 = 0x647e2ba9
)

// ConnectionConfig defines how a chain should connect with other chains.
type ConnectionConfig struct {
	// RMNVerificationDisabled is true if we do not want the RMN to bless messages FROM this chain.
	RMNVerificationDisabled bool `json:"rmnVerificationDisabled"`
	// AllowListEnabled is true if we want an allowlist to dictate who can send messages TO this chain.
	AllowListEnabled bool `json:"allowListEnabled"`
}

// ChainDefinition defines how a chain should be configured on both remote chains and itself.
type ChainDefinition struct {
	// ConnectionConfig holds configuration for connection.
	ConnectionConfig `json:"connectionConfig"`
	// Selector is the chain selector of this chain.
	Selector uint64 `json:"selector"`
	// GasPrice defines the USD price (18 decimals) per unit gas for this chain as a destination.
	GasPrice *big.Int `json:"gasPrice"`
	// TokenPrices define the USD price (18 decimals) per 1e18 of the smallest token denomination for various tokens on this chain.
	TokenPrices map[string]*big.Int `json:"tokenPrices"`
	// FeeQuoterDestChainConfig is the configuration on a fee quoter for this chain as a destination.
	FeeQuoterDestChainConfig FeeQuoterDestChainConfig `json:"feeQuoterDestChainConfig"`
}

type FeeQuoterDestChainConfig struct {
	IsEnabled                         bool
	MaxNumberOfTokensPerMsg           uint16
	MaxDataBytes                      uint32
	MaxPerMsgGasLimit                 uint32
	DestGasOverhead                   uint32
	DestGasPerPayloadByteBase         uint8
	DestGasPerPayloadByteHigh         uint8
	DestGasPerPayloadByteThreshold    uint16
	DestDataAvailabilityOverheadGas   uint32
	DestGasPerDataAvailabilityByte    uint16
	DestDataAvailabilityMultiplierBps uint16
	ChainFamilySelector               uint32
	EnforceOutOfOrder                 bool
	DefaultTokenFeeUSDCents           uint16
	DefaultTokenDestGasOverhead       uint32
	DefaultTxGasLimit                 uint32
	GasMultiplierWeiPerEth            uint64
	GasPriceStalenessThreshold        uint32
	NetworkFeeUSDCents                uint32
}

// GenericChainDefinition is an interface that defines a chain config for lane deployment
// It is used to convert between Ton and EVM fee quoter configs.
type GenericChainDefinition interface {
	GetChainFamily() string
	GetSelector() uint64
}

// EVMChainDefinition is used as the intermediary format: as long as chains can convert
// to it, we can convert to TON specific format
type EVMChainDefinition struct {
	ChainDefinition
	OnRampVersion []byte
}

func (c EVMChainDefinition) GetChainFamily() string {
	return chainsel.FamilyEVM
}

func (c EVMChainDefinition) GetSelector() uint64 {
	return c.Selector
}

func (c EVMChainDefinition) GetConvertedTonFeeQuoterConfig() ton_fee_quoter.DestChainConfig {
	efqc := c.FeeQuoterDestChainConfig
	// Handle the byte slice to fixed-size array conversion
	return ton_fee_quoter.DestChainConfig{
		IsEnabled:                         efqc.IsEnabled,
		MaxNumberOfTokensPerMsg:           efqc.MaxNumberOfTokensPerMsg,
		MaxDataBytes:                      efqc.MaxDataBytes,
		MaxPerMsgGasLimit:                 efqc.MaxPerMsgGasLimit,
		DestGasOverhead:                   efqc.DestGasOverhead,
		DestGasPerPayloadByteBase:         efqc.DestGasPerPayloadByteBase,
		DestGasPerPayloadByteHigh:         efqc.DestGasPerPayloadByteHigh,
		DestGasPerPayloadByteThreshold:    efqc.DestGasPerPayloadByteThreshold,
		DestDataAvailabilityOverheadGas:   efqc.DestDataAvailabilityOverheadGas,
		DestGasPerDataAvailabilityByte:    efqc.DestGasPerDataAvailabilityByte,
		DestDataAvailabilityMultiplierBps: efqc.DestDataAvailabilityMultiplierBps,
		ChainFamilySelector:               binary.BigEndian.Uint32(efqc.ChainFamilySelector[:]),
		EnforceOutOfOrder:                 efqc.EnforceOutOfOrder,
		DefaultTokenFeeUsdCents:           efqc.DefaultTokenFeeUSDCents,
		DefaultTokenDestGasOverhead:       efqc.DefaultTokenDestGasOverhead,
		DefaultTxGasLimit:                 efqc.DefaultTxGasLimit,
		GasMultiplierWeiPerEth:            efqc.GasMultiplierWeiPerEth,
		GasPriceStalenessThreshold:        efqc.GasPriceStalenessThreshold,
		NetworkFeeUsdCents:                efqc.NetworkFeeUSDCents,
	}
}

type TonChainDefinition struct {
	// ConnectionConfig holds configuration for connection.
	ConnectionConfig `json:"connectionConfig"`
	// Selector is the chain selector of this chain.
	Selector uint64 `json:"selector"`
	// GasPrice defines the USD price (18 decimals) per unit gas for this chain as a destination.
	GasPrice *big.Int `json:"gasPrice"`
	// TokenPrices defines USD price for a token address (28 decimals)
	TokenPrices map[*address.Address]*big.Int
	// FeeQuoterDestChainConfig is the configuration on a fee quoter for this chain as a destination.
	FeeQuoterDestChainConfig ton_fee_quoter.DestChainConfig `json:"feeQuoterDestChainConfig"`
	// RemoveTokenTransferFeeConfigs holds token transfer fees to added or removed from fee quoter
	TokenTransferFeeConfigs map[uint64]ton_fee_quoter.UpdateTokenTransferFeeConfig
}

func (c TonChainDefinition) GetChainFamily() string {
	return chainsel.FamilyTon
}

func (c TonChainDefinition) GetSelector() uint64 {
	return c.Selector
}

func (c TonChainDefinition) GetConvertedEVMFeeQuoterConfig() evm_fee_quoter.FeeQuoterDestChainConfig {
	tfqc := c.FeeQuoterDestChainConfig
	// Handle the byte slice to fixed-size array conversion
	var chainFamilySelector [4]byte
	binary.BigEndian.PutUint32(chainFamilySelector[:], tfqc.ChainFamilySelector)

	return evm_fee_quoter.FeeQuoterDestChainConfig{
		IsEnabled:                         tfqc.IsEnabled,
		MaxNumberOfTokensPerMsg:           tfqc.MaxNumberOfTokensPerMsg,
		MaxDataBytes:                      tfqc.MaxDataBytes,
		MaxPerMsgGasLimit:                 tfqc.MaxPerMsgGasLimit,
		DestGasOverhead:                   tfqc.DestGasOverhead,
		DestGasPerPayloadByteBase:         tfqc.DestGasPerPayloadByteBase,
		DestGasPerPayloadByteHigh:         tfqc.DestGasPerPayloadByteHigh,
		DestGasPerPayloadByteThreshold:    tfqc.DestGasPerPayloadByteThreshold,
		DestDataAvailabilityOverheadGas:   tfqc.DestDataAvailabilityOverheadGas,
		DestGasPerDataAvailabilityByte:    tfqc.DestGasPerDataAvailabilityByte,
		DestDataAvailabilityMultiplierBps: tfqc.DestDataAvailabilityMultiplierBps,
		ChainFamilySelector:               chainFamilySelector,
		EnforceOutOfOrder:                 tfqc.EnforceOutOfOrder,
		DefaultTokenFeeUSDCents:           tfqc.DefaultTokenFeeUsdCents,
		DefaultTokenDestGasOverhead:       tfqc.DefaultTokenDestGasOverhead,
		DefaultTxGasLimit:                 tfqc.DefaultTxGasLimit,
		GasMultiplierWeiPerEth:            tfqc.GasMultiplierWeiPerEth,
		GasPriceStalenessThreshold:        tfqc.GasPriceStalenessThreshold,
		NetworkFeeUSDCents:                tfqc.NetworkFeeUsdCents,
	}
}

func (c TonChainDefinition) Validate(client any, state tonstate.CCIPChainState) error {
	// TODO: validate router, onramp, offramp, feequoter are deployed

	return nil
}

package config

import (
	"encoding/binary"
	"math/big"

	chain_selectors "github.com/smartcontractkit/chain-selectors"

	evm_fee_quoter "github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/fee_quoter"

	ton_fee_quoter "github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/feequoter"
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
	// TokenTransferFeeConfigs is a map of chain selector to token transfer cost configuration.
	TokenTransferFeeConfigs map[uint64]FeeQuoterTokenTransferFeeConfig `json:"tokenTransferFeeConfigs"`
}

func (d ChainDefinition) ChainFamily() string {
	family, err := chain_selectors.GetSelectorFamily(d.Selector)
	if err != nil {
		panic(err)
	}
	return family
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

type FeeQuoterTokenTransferFeeConfig struct {
	MinFeeUSDCents    uint32
	MaxFeeUSDCents    uint32
	DeciBps           uint16
	DestGasOverhead   uint32
	DestBytesOverhead uint32
	IsEnabled         bool
}

// TonFeeQuoterConfig Convert generic fee quoter config to TON fee quoter config
func TonFeeQuoterConfig(fqc FeeQuoterDestChainConfig) ton_fee_quoter.DestChainConfig {
	// NOTE: EnforceOutOfOrder is always true for TON
	return ton_fee_quoter.DestChainConfig{
		IsEnabled:                         fqc.IsEnabled,
		MaxNumberOfTokensPerMsg:           fqc.MaxNumberOfTokensPerMsg,
		MaxDataBytes:                      fqc.MaxDataBytes,
		MaxPerMsgGasLimit:                 fqc.MaxPerMsgGasLimit,
		DestGasOverhead:                   fqc.DestGasOverhead,
		DestGasPerPayloadByteBase:         fqc.DestGasPerPayloadByteBase,
		DestGasPerPayloadByteHigh:         fqc.DestGasPerPayloadByteHigh,
		DestGasPerPayloadByteThreshold:    fqc.DestGasPerPayloadByteThreshold,
		DestDataAvailabilityOverheadGas:   fqc.DestDataAvailabilityOverheadGas,
		DestGasPerDataAvailabilityByte:    fqc.DestGasPerDataAvailabilityByte,
		DestDataAvailabilityMultiplierBps: fqc.DestDataAvailabilityMultiplierBps,
		ChainFamilySelector:               fqc.ChainFamilySelector,
		DefaultTokenFeeUsdCents:           fqc.DefaultTokenFeeUSDCents,
		DefaultTokenDestGasOverhead:       fqc.DefaultTokenDestGasOverhead,
		DefaultTxGasLimit:                 fqc.DefaultTxGasLimit,
		GasMultiplierWeiPerEth:            fqc.GasMultiplierWeiPerEth,
		GasPriceStalenessThreshold:        fqc.GasPriceStalenessThreshold,
		NetworkFeeUsdCents:                fqc.NetworkFeeUSDCents,
	}
}

func EvmFeeQuoterConfig(fqc FeeQuoterDestChainConfig) evm_fee_quoter.FeeQuoterDestChainConfig {
	// Handle the byte slice to fixed-size array conversion
	var chainFamilySelector [4]byte
	binary.BigEndian.PutUint32(chainFamilySelector[:], fqc.ChainFamilySelector)

	return evm_fee_quoter.FeeQuoterDestChainConfig{
		IsEnabled:                         fqc.IsEnabled,
		MaxNumberOfTokensPerMsg:           fqc.MaxNumberOfTokensPerMsg,
		MaxDataBytes:                      fqc.MaxDataBytes,
		MaxPerMsgGasLimit:                 fqc.MaxPerMsgGasLimit,
		DestGasOverhead:                   fqc.DestGasOverhead,
		DestGasPerPayloadByteBase:         fqc.DestGasPerPayloadByteBase,
		DestGasPerPayloadByteHigh:         fqc.DestGasPerPayloadByteHigh,
		DestGasPerPayloadByteThreshold:    fqc.DestGasPerPayloadByteThreshold,
		DestDataAvailabilityOverheadGas:   fqc.DestDataAvailabilityOverheadGas,
		DestGasPerDataAvailabilityByte:    fqc.DestGasPerDataAvailabilityByte,
		DestDataAvailabilityMultiplierBps: fqc.DestDataAvailabilityMultiplierBps,
		ChainFamilySelector:               chainFamilySelector,
		EnforceOutOfOrder:                 fqc.EnforceOutOfOrder,
		DefaultTokenFeeUSDCents:           fqc.DefaultTokenFeeUSDCents,
		DefaultTokenDestGasOverhead:       fqc.DefaultTokenDestGasOverhead,
		DefaultTxGasLimit:                 fqc.DefaultTxGasLimit,
		GasMultiplierWeiPerEth:            fqc.GasMultiplierWeiPerEth,
		GasPriceStalenessThreshold:        fqc.GasPriceStalenessThreshold,
		NetworkFeeUSDCents:                fqc.NetworkFeeUSDCents,
	}
}

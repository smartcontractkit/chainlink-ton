package config

import (
	"encoding/binary"
	"math/big"

	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/xssnick/tonutils-go/address"

	evm_fee_quoter "github.com/smartcontractkit/chainlink-ccip/chains/evm/gobindings/generated/v1_6_0/fee_quoter"
	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
	ton_fee_quoter "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
)

// ChainDefinition is an interface that defines a chain config for lane deployment
// It is used to convert between Ton and EVM fee quoter configs.
type ChainDefinition interface {
	GetChainFamily() string
	GetSelector() uint64
}

// EVMChainDefinition is used as the intermediary format: as long as chains can convert
// to it, we can convert to TON specific format
type EVMChainDefinition struct {
	v1_6.ChainDefinition
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
	v1_6.ConnectionConfig `json:"connectionConfig"`
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

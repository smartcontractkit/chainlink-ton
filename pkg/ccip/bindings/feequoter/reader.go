package feequoter

import (
	"math/big"

	"github.com/samber/lo"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/parser"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// GetOwner gets the owner of the FeeQuoter contract
var GetOwner = ownable2step.GetOwner

// GetPendingOwner gets the pending owner of the FeeQuoter contract
var GetPendingOwner = ownable2step.GetPendingOwner

// GetDestChainConfig gets the destination chain configuration for a given chain selector.
//
// NOTE: The on-chain getter "destChainConfig" returns a full DestChainConfig struct which contains:
//   - config: FeeQuoterDestChainConfig (18 primitive fields)
//   - usdPerUnitGas: Cell<GasPrice>
//   - tokenTransferFeeConfigs: map<address, TokenTransferFeeConfig>
//
// However, this decoder only parses the first 18 values (the FeeQuoterDestChainConfig fields)
// and ignores the remaining cell/dictionary fields. This works because TVM unpacks primitive
// struct fields onto the stack as individual values. We intentionally reuse the on-chain getter
// while only extracting the fields we need off-chain.
//
// See on-chain types in: contracts/contracts/ccip/fee_quoter/types.tolk (DestChainConfig, FeeQuoterDestChainConfig)
var GetDestChainConfig = tvm.Getter[uint64, DestChainConfig]{
	Name: destChainConfigGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (DestChainConfig, error) {
		var c DestChainConfig
		isEnabledInt, err := r.Int(0)
		if err != nil {
			return c, err
		}
		isEnabled := isEnabledInt.Cmp(big.NewInt(-1)) == 0
		maxNumberOfTokensPerMsg, err := r.Int(1)
		if err != nil {
			return c, err
		}
		maxDataBytes, err := r.Int(2)
		if err != nil {
			return c, err
		}
		maxPerMsgGasLimit, err := r.Int(3)
		if err != nil {
			return c, err
		}
		destGasOverhead, err := r.Int(4)
		if err != nil {
			return c, err
		}
		destGasPerPayloadByteBase, err := r.Int(5)
		if err != nil {
			return c, err
		}
		destGasPerPayloadByteHigh, err := r.Int(6)
		if err != nil {
			return c, err
		}
		destGasPerPayloadByteThreshold, err := r.Int(7)
		if err != nil {
			return c, err
		}
		destDataAvailabilityOverheadGas, err := r.Int(8)
		if err != nil {
			return c, err
		}
		destGasPerDataAvailabilityByte, err := r.Int(9)
		if err != nil {
			return c, err
		}
		destDataAvailabilityMultiplierBps, err := r.Int(10)
		if err != nil {
			return c, err
		}
		chainFamilySelector, err := r.Int(11)
		if err != nil {
			return c, err
		}
		defaultTokenFeeUsdCents, err := r.Int(12)
		if err != nil {
			return c, err
		}
		defaultTokenDestGasOverhead, err := r.Int(13)
		if err != nil {
			return c, err
		}
		defaultTxGasLimit, err := r.Int(14)
		if err != nil {
			return c, err
		}
		gasMultiplierWeiPerEth, err := r.Int(15)
		if err != nil {
			return c, err
		}
		gasPriceStalenessThreshold, err := r.Int(16)
		if err != nil {
			return c, err
		}
		networkFeeUsdCents, err := r.Int(17)
		if err != nil {
			return c, err
		}

		return DestChainConfig{
			IsEnabled:                         isEnabled,
			MaxNumberOfTokensPerMsg:           uint16(maxNumberOfTokensPerMsg.Uint64()),
			MaxDataBytes:                      uint32(maxDataBytes.Uint64()),
			MaxPerMsgGasLimit:                 uint32(maxPerMsgGasLimit.Uint64()),
			DestGasOverhead:                   uint32(destGasOverhead.Uint64()),
			DestGasPerPayloadByteBase:         uint8(destGasPerPayloadByteBase.Uint64()),
			DestGasPerPayloadByteHigh:         uint8(destGasPerPayloadByteHigh.Uint64()),
			DestGasPerPayloadByteThreshold:    uint16(destGasPerPayloadByteThreshold.Uint64()),
			DestDataAvailabilityOverheadGas:   uint32(destDataAvailabilityOverheadGas.Uint64()),
			DestGasPerDataAvailabilityByte:    uint16(destGasPerDataAvailabilityByte.Uint64()),
			DestDataAvailabilityMultiplierBps: uint16(destDataAvailabilityMultiplierBps.Uint64()),
			ChainFamilySelector:               uint32(chainFamilySelector.Uint64()),
			DefaultTokenFeeUsdCents:           uint16(defaultTokenFeeUsdCents.Uint64()),
			DefaultTokenDestGasOverhead:       uint32(defaultTokenDestGasOverhead.Uint64()),
			DefaultTxGasLimit:                 uint32(defaultTxGasLimit.Uint64()),
			GasMultiplierWeiPerEth:            gasMultiplierWeiPerEth.Uint64(),
			GasPriceStalenessThreshold:        uint32(gasPriceStalenessThreshold.Uint64()),
			NetworkFeeUsdCents:                uint32(networkFeeUsdCents.Uint64()),
		}, nil
	}),
}

// GetDestinationChainGasPrice gets the gas price for a given destination chain selector
var GetDestinationChainGasPrice = tvm.Getter[uint64, USDPerUnitGas]{
	Name: destinationChainGasPriceGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (USDPerUnitGas, error) {
		var u USDPerUnitGas
		c, err := r.Cell(0)
		if err != nil {
			return u, err
		}
		err = tlb.LoadFromCell(&u, c.BeginParse())
		return u, err
	}),
}

// GetTokenPrice gets the token price for a given token address
var GetTokenPrice = tvm.Getter[*address.Address, TimestampedPrice]{
	Name: tokenPriceGetter,
	Encoder: tvm.NewArgsEncoder(func(addr *address.Address) ([]any, error) {
		// Encode address as a cell slice (as expected by the contract)
		addrSlice := cell.BeginCell().MustStoreAddr(addr).EndCell().BeginParse()
		return []any{addrSlice}, nil
	}),
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (TimestampedPrice, error) {
		var p TimestampedPrice
		value, err := r.Int(0)
		if err != nil {
			return p, err
		}
		timestamp, err := r.Int(1)
		if err != nil {
			return p, err
		}

		return TimestampedPrice{
			Value:     value,
			Timestamp: uint32(timestamp.Uint64()),
		}, nil
	}),
}

// GetStaticConfig gets the static configuration of the FeeQuoter contract
var GetStaticConfig = tvm.NewNoArgsGetter(tvm.NoArgsOpts[StaticConfig]{
	Name: staticConfigGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (StaticConfig, error) {
		var s StaticConfig
		maxFeeJuelsPerMsg, err := r.Int(0)
		if err != nil {
			return s, err
		}
		linkTokenAddressSlice, err := r.Slice(1)
		if err != nil {
			return s, err
		}
		linkTokenAddress, err := linkTokenAddressSlice.LoadAddr()
		if err != nil {
			return s, err
		}
		tokenPriceStalenessThreshold, err := r.Int(2)
		if err != nil {
			return s, err
		}
		return StaticConfig{
			MaxFeeJuelsPerMsg:  maxFeeJuelsPerMsg,
			LinkToken:          linkTokenAddress,
			StalenessThreshold: uint32(tokenPriceStalenessThreshold.Uint64()),
		}, nil
	}),
})

// GetDestChainSelectors gets all destination chain selectors
var GetDestChainSelectors = tvm.NewNoArgsGetter(tvm.NoArgsOpts[[]uint64]{
	Name: DestChainsGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) ([]uint64, error) {
		selectors, err := parser.ParseLispTuple[*big.Int](r.AsTuple())
		if err != nil {
			return nil, err
		}
		return lo.Map(selectors, func(x *big.Int, _ int) uint64 { return x.Uint64() }), nil
	}),
})

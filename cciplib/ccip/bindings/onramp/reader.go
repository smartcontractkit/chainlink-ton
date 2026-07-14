package onramp

import (
	"math/big"

	"github.com/samber/lo"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/parser"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
)

// GetOwner gets the owner of the OnRamp contract
var GetOwner = ownable2step.GetOwner

// GetPendingOwner gets the pending owner of the OnRamp contract
var GetPendingOwner = ownable2step.GetPendingOwner

// GetDestChainConfig gets the destination chain configuration for a given chain selector
var GetDestChainConfig = tvm.Getter[uint64, DestChainConfig]{
	Name: destChainConfigGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (DestChainConfig, error) {
		var cfg DestChainConfig
		routerAddressSlice, err := r.Slice(0)
		if err != nil {
			return cfg, err
		}
		routerAddress, err := routerAddressSlice.LoadAddr()
		if err != nil {
			return cfg, err
		}
		seqNum, err := r.Int(1)
		if err != nil {
			return cfg, err
		}
		allowlistEnabledInt, err := r.Int(2)
		if err != nil {
			return cfg, err
		}
		allowlistEnabled := allowlistEnabledInt.Cmp(big.NewInt(-1)) == 0
		return DestChainConfig{
			Router:           routerAddress,
			SequenceNumber:   seqNum.Uint64(),
			AllowListEnabled: allowlistEnabled,
			// skip parsing allowedSenders
		}, nil
	}),
}

// GetDynamicConfig gets the dynamic configuration of the OnRamp contract
var GetDynamicConfig = tvm.NewNoArgsGetter(tvm.NoArgsOpts[DynamicConfig]{
	Name: dynamicConfigGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (DynamicConfig, error) {
		var cfg DynamicConfig
		feeQuoterAddressSlice, err := r.Slice(0)
		if err != nil {
			return cfg, err
		}
		feeQuoterAddress, err := feeQuoterAddressSlice.LoadAddr()
		if err != nil {
			return cfg, err
		}
		feeAggregatorAddressSlice, err := r.Slice(1)
		if err != nil {
			return cfg, err
		}
		feeAggregatorAddress, err := feeAggregatorAddressSlice.LoadAddr()
		if err != nil {
			return cfg, err
		}
		allowlistAdminAddressSlice, err := r.Slice(2)
		if err != nil {
			return cfg, err
		}
		allowlistAdminAddress, err := allowlistAdminAddressSlice.LoadAddr()
		if err != nil {
			return cfg, err
		}
		reserveValue, err := r.Int(3)
		if err != nil {
			return cfg, err
		}
		reserve := tlb.FromNanoTON(reserveValue)

		return DynamicConfig{
			FeeQuoter:      feeQuoterAddress,
			FeeAggregator:  feeAggregatorAddress,
			AllowListAdmin: allowlistAdminAddress,
			Reserve:        reserve,
		}, nil
	}),
})

// GetStaticConfig gets the static configuration of the OnRamp contract
var GetStaticConfig = tvm.NewNoArgsGetter(tvm.NoArgsOpts[StaticConfig]{
	Name: staticConfigGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (StaticConfig, error) {
		chainSelector, err := r.Int(0)
		if err != nil {
			return StaticConfig{}, err
		}
		return StaticConfig{
			ChainSelector: chainSelector.Uint64(),
		}, nil
	}),
})

// GetDestChainSelectors gets all destination chain selectors
var GetDestChainSelectors = tvm.NewNoArgsGetter(tvm.NoArgsOpts[[]uint64]{
	Name: destChainSelectorsGetter,
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) ([]uint64, error) {
		selectors, err := parser.ParseLispTuple[*big.Int](r.AsTuple())
		if err != nil {
			return nil, err
		}
		return lo.Map(selectors, func(x *big.Int, _ int) uint64 { return x.Uint64() }), nil
	}),
})

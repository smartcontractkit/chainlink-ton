package operation

import (
	"fmt"
	"math/big"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tlbe"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
)

type FeeTokenConfig struct {
	PremiumMultiplierWeiPerEth uint64
}

// UpdateFeeQuoterFeeTokensInput contains configuration for updating FeeQuoter fee tokens.
// FeeTokens maps token addresses to add/update, Remove lists token addresses to remove.
type UpdateFeeQuoterFeeTokensInput struct {
	FeeTokens map[string]FeeTokenConfig // token address (string) -> { premium multiplier }
	Remove    []string                  // token addresses (string) to remove as fee tokens
}

// UpdateFeeQuoterFeeTokensOp operation to update FeeQuoter fee tokens
var UpdateFeeQuoterFeeTokensOp = operations.NewOperation(
	"ton/ops/ccip/fee-quoter/update-fee-tokens",
	semver.MustParse("0.1.0"),
	"Updates FeeQuoter fee tokens",
	updateFeeQuoterFeeTokens,
)

func updateFeeQuoterFeeTokens(b operations.Bundle, dp *dep.DependencyProvider, in UpdateFeeQuoterFeeTokensInput) ([]*tlbe.Cell[tlb.InternalMessage], error) {
	stateCCIP, err := dep.Resolve[state.CCIPChainState](dp)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve ton ccip state: %w", err)
	}

	// skip if there's nothing to add or remove
	if len(in.FeeTokens) == 0 && len(in.Remove) == 0 {
		return nil, nil
	}

	addEntries := make(map[common.AddressWrap]feequoter.FeeToken, len(in.FeeTokens))
	for token, update := range in.FeeTokens {
		//nolint:govet // allow shadowing
		tokenAddress, err := address.ParseAddr(token)
		if err != nil {
			return nil, fmt.Errorf("failed to parse token address: %w", err)
		}
		addEntries[common.AddressWrap{Val: tokenAddress}] = feequoter.FeeToken{
			PremiumMultiplierWeiPerEth: update.PremiumMultiplierWeiPerEth,
		}
	}

	remove := make(common.SnakedCell[common.AddressWrap], 0, len(in.Remove))
	for _, addrStr := range in.Remove {
		//nolint:govet // allow shadowing
		tokenAddress, err := address.ParseAddr(addrStr)
		if err != nil {
			return nil, fmt.Errorf("failed to parse remove address %q: %w", addrStr, err)
		}
		remove = append(remove, common.AddressWrap{Val: tokenAddress})
	}

	b.Logger.Debugf("Updated FeeQuoter fee tokens: add=%v, remove=%v, address: %v", addEntries, remove, stateCCIP.FeeQuoter.String())

	input := feequoter.UpdateFeeTokens{
		Add:    tlbe.NewDict(addEntries),
		Remove: remove,
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}

	return tlbe.ManyCellsFrom([]tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &stateCCIP.FeeQuoter,
			Body:    payload,
		},
	})
}

type GasPrice struct {
	ExecutionGasPrice        *big.Int // int112
	DataAvailabilityGasPrice *big.Int // int112
}

// copied from chainlink-ccip chainfee package
func FromPackedGasFee(packedFee *big.Int) GasPrice {
	ones112 := big.NewInt(0)
	for i := range 112 {
		ones112 = ones112.SetBit(ones112, i, 1)
	}

	execFee := new(big.Int).And(packedFee, ones112)
	daFee := new(big.Int).Rsh(packedFee, 112)
	return GasPrice{
		ExecutionGasPrice:        execFee,
		DataAvailabilityGasPrice: daFee,
	}
}

type AddPriceUpdaterInput struct {
	PriceUpdater *address.Address
}

// UpdateFeeQuoterPricesInput contains configuration for updating FeeQuoter price configs
type UpdateFeeQuoterPricesInput struct {
	TokenPrices map[string]*big.Int // token address (string) -> price
	GasPrices   map[uint64]GasPrice // dest chain -> gas price
}

// UpdateFeeQuoterPricesOp operation to update FeeQuoter prices
var UpdateFeeQuoterPricesOp = operations.NewOperation(
	"ton/ops/ccip/fee-quoter/update-prices",
	semver.MustParse("0.1.0"),
	"Updates FeeQuoter token and gas prices",
	updateFeeQuoterPrices,
)

func updateFeeQuoterPrices(b operations.Bundle, dp *dep.DependencyProvider, in UpdateFeeQuoterPricesInput) ([]*tlbe.Cell[tlb.InternalMessage], error) {
	if len(in.TokenPrices) == 0 && len(in.GasPrices) == 0 {
		// Nothing to update
		return nil, nil
	}

	stateCCIP, err := dep.Resolve[state.CCIPChainState](dp)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve ton ccip state: %w", err)
	}

	tokenPrices := make([]feequoter.TokenPriceUpdate, 0, len(in.TokenPrices))
	gasPrices := make([]feequoter.GasPriceUpdate, 0, len(in.GasPrices))

	for token, value := range in.TokenPrices {
		//nolint:govet // allow shadowing
		tokenAddress, err := address.ParseAddr(token)
		if err != nil {
			return nil, fmt.Errorf("failed to parse token address: %w", err)
		}
		tokenPrices = append(tokenPrices, feequoter.TokenPriceUpdate{
			SourceToken: tokenAddress,
			UsdPerToken: value,
		})
	}
	for chainSelector, update := range in.GasPrices {
		gasPrices = append(gasPrices, feequoter.GasPriceUpdate{
			DestChainSelector:        chainSelector,
			ExecutionGasPrice:        update.ExecutionGasPrice,
			DataAvailabilityGasPrice: update.DataAvailabilityGasPrice,
		})
	}

	input := feequoter.UpdatePrices{
		TokenPrices:    tokenPrices,
		GasPrices:      gasPrices,
		SendExcessesTo: address.NewAddressNone(),
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}

	return tlbe.ManyCellsFrom([]tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &stateCCIP.FeeQuoter,
			Body:    payload,
		},
	})
}

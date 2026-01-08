package operation

import (
	"fmt"
	"math/big"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
)

type UpdateFeeQuoterDestChainConfigsInput []feequoter.UpdateDestChainConfig

type UpdateFeeQuoterDestChainConfigsOutput struct {
}

var UpdateFeeQuoterDestChainConfigsOp = operations.NewOperation(
	"update-fee-quoter-dest-chain-configs",
	semver.MustParse("0.1.0"),
	"Updates fee quoter's destination chain configs",
	updateFeeQuoterDestChainConfigs,
)

func updateFeeQuoterDestChainConfigs(b operations.Bundle, deps config.CCIPDeps, in UpdateFeeQuoterDestChainConfigsInput) (*helpers.Transactions, error) {
	addr := deps.CCIPOnChainState[deps.TonChain.Selector].FeeQuoter

	// Skip if there's no updates
	if len(in) == 0 {
		return helpers.NewEmptyTransactions(), nil
	}

	input := feequoter.UpdateDestChainConfigs{
		Updates: common.SnakeData[feequoter.UpdateDestChainConfig](in),
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}

	messages := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &addr,
			Body:    payload,
		},
	}
	return helpers.NewTransactions(messages)
}

type FeeTokenConfig struct {
	PremiumMultiplierWeiPerEth uint64
}

// UpdateFeeQuoterFeeTokensInput contains configuration for updating FeeQuoter fee tokens
type UpdateFeeQuoterFeeTokensInput struct {
	FeeTokens map[string]FeeTokenConfig // token address (string) -> { premium multiplier }
}

// UpdateFeeQuoterPricesOp operation to update FeeQuoter prices
var UpdateFeeQuoterFeeTokensOp = operations.NewOperation(
	"update-fee-quoter-fee-tokens-op",
	semver.MustParse("0.1.0"),
	"Updates FeeQuoter fee tokens",
	updateFeeQuoterFeeTokens,
)

func updateFeeQuoterFeeTokens(b operations.Bundle, deps config.CCIPDeps, in UpdateFeeQuoterFeeTokensInput) (*helpers.Transactions, error) {
	feeQuoterAddress := deps.CCIPOnChainState[deps.TonChain.Selector].FeeQuoter

	configs := cell.NewDict(267)
	for token, update := range in.FeeTokens {
		tokenAddress, err := address.ParseAddr(token)
		if err != nil {
			return nil, fmt.Errorf("failed to parse token address: %w", err)
		}
		key := cell.BeginCell().MustStoreAddr(tokenAddress).EndCell()
		value, err := tlb.ToCell(feequoter.FeeToken{
			PremiumMultiplierWeiPerEth: update.PremiumMultiplierWeiPerEth,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to construct fee token update: %w", err)
		}
		if err := configs.Set(key, value); err != nil {
			return nil, fmt.Errorf("failed to construct fee token update: %w", err)
		}
	}

	b.Logger.Debugf("Updated FeeQuoter fee tokens: %v, address: %v", configs, feeQuoterAddress.String())

	// skip if there's no updates
	if len(in.FeeTokens) == 0 {
		return helpers.NewEmptyTransactions(), nil
	}

	input := feequoter.UpdateFeeTokens{
		Add:    configs,
		Remove: nil,
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}
	messages := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &feeQuoterAddress,
			Body:    payload,
		},
	}
	return helpers.NewTransactions(messages)
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

// UpdateFeeQuoterPricesOp operation to update FeeQuoter prices
var AddPriceUpdaterOp = operations.NewOperation(
	"add-price-updater-op",
	semver.MustParse("0.1.0"),
	"Adds a FeeQuoter allowed price updater",
	addPriceUpdater,
)

func addPriceUpdater(b operations.Bundle, deps config.CCIPDeps, in AddPriceUpdaterInput) (*helpers.Transactions, error) {
	feeQuoterAddress := deps.CCIPOnChainState[deps.TonChain.Selector].FeeQuoter

	payload, err := tlb.ToCell(feequoter.AddPriceUpdater{
		PriceUpdater: in.PriceUpdater,
	})
	if err != nil {
		return nil, err
	}
	messages := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &feeQuoterAddress,
			Body:    payload,
		},
	}
	return helpers.NewTransactions(messages)
}

type RemovePriceUpdaterInput struct {
	PriceUpdater *address.Address
}

// UpdateFeeQuoterPricesOp operation to update FeeQuoter prices
var RemovePriceUpdaterOp = operations.NewOperation(
	"remove-price-updater-op",
	semver.MustParse("0.1.0"),
	"Removes a FeeQuoter allowed price updater",
	removePriceUpdater,
)

func removePriceUpdater(b operations.Bundle, deps config.CCIPDeps, in RemovePriceUpdaterInput) (*helpers.Transactions, error) {
	feeQuoterAddress := deps.CCIPOnChainState[deps.TonChain.Selector].FeeQuoter

	payload, err := tlb.ToCell(feequoter.RemovePriceUpdater{
		PriceUpdater: in.PriceUpdater,
	})
	if err != nil {
		return nil, err
	}
	messages := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &feeQuoterAddress,
			Body:    payload,
		},
	}
	return helpers.NewTransactions(messages)
}

// UpdateFeeQuoterPricesInput contains configuration for updating FeeQuoter price configs
type UpdateFeeQuoterPricesInput struct {
	TokenPrices map[string]*big.Int // token address (string) -> price
	GasPrices   map[uint64]GasPrice // dest chain -> gas price
}

// UpdateFeeQuoterPricesOp operation to update FeeQuoter prices
var UpdateFeeQuoterPricesOp = operations.NewOperation(
	"update-fee-quoter-prices-op",
	semver.MustParse("0.1.0"),
	"Updates FeeQuoter token and gas prices",
	updateFeeQuoterPrices,
)

func updateFeeQuoterPrices(b operations.Bundle, deps config.CCIPDeps, in UpdateFeeQuoterPricesInput) (*helpers.Transactions, error) {
	feeQuoterAddress := deps.CCIPOnChainState[deps.TonChain.Selector].FeeQuoter

	if len(in.TokenPrices) == 0 && len(in.GasPrices) == 0 {
		// Nothing to update
		return helpers.NewEmptyTransactions(), nil
	}

	tokenPrices := make([]feequoter.TokenPriceUpdate, 0, len(in.TokenPrices))
	gasPrices := make([]feequoter.GasPriceUpdate, 0, len(in.GasPrices))

	for token, value := range in.TokenPrices {
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
		TokenPrices:    common.SnakeData[feequoter.TokenPriceUpdate](tokenPrices),
		GasPrices:      common.SnakeData[feequoter.GasPriceUpdate](gasPrices),
		SendExcessesTo: address.NewAddressNone(),
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}
	messages := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &feeQuoterAddress,
			Body:    payload,
		},
	}
	return helpers.NewTransactions(messages)
}

package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	cldfChain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
)

func (a *TonAdapter) ConfigureLaneLegAsSource() *operations.Sequence[lanes.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return ConfigureLaneLegAsSource
}

func (a *TonAdapter) ConfigureLaneLegAsDest() *operations.Sequence[lanes.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return ConfigureLaneLegAsDest
}

var ConfigureLaneLegAsSource = operations.NewSequence(
	"ConfigureLaneLegAsSource",
	semver.MustParse("1.6.0"),
	"Configures lane leg as source on CCIP 1.6.0",
	func(b operations.Bundle, chains cldfChain.BlockChains, input lanes.UpdateLanesInput) (sequences.OnChainOutput, error) {
		var txs [][]byte

		deps, err := extractTonDeps(input)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to extract TON deps: %w", err)
		}

		// update fee quoter with dest chain configs
		updateFeeQuoterDestChainConfigs := intoUpdateFeeQuoterDestChainConfigs(input)
		b.Logger.Infow("Updating destination configs on FeeQuoter", "input", updateFeeQuoterDestChainConfigs)
		feeQuoterReport, err := operations.ExecuteOperation(b, operation.UpdateFeeQuoterDestChainConfigsOp, deps, updateFeeQuoterDestChainConfigs)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update feequoter destinations: %w", err)
		}
		txs = append(txs, feeQuoterReport.Output...)

		// update onramp with dest chain configs
		updateOnRampDestChainConfigs := intoUpdateOnRampDestChainConfigs(input)
		b.Logger.Infow("Updating destination configs on OnRamp", "input", updateOnRampDestChainConfigs)
		onRampReport, err := operations.ExecuteOperation(b, operation.UpdateOnRampDestChainConfigsOp, deps, updateOnRampDestChainConfigs)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update onramp destinations: %w", err)
		}
		txs = append(txs, onRampReport.Output...)

		// update fee quoter with gas prices
		updateFeeQuoterPricesConfig := intoUpdateFeeQuoterPricesConfig(input)
		b.Logger.Infow("Updating prices on FeeQuoter", "input", updateFeeQuoterPricesConfig)
		updatePricesReport, err := operations.ExecuteOperation(b, operation.UpdateFeeQuoterPricesOp, deps, updateFeeQuoterPricesConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update feequoter prices: %w", err)
		}
		txs = append(txs, updatePricesReport.Output...)

		// temporary fix for go-lint as txs is not used yet
		b.Logger.Debugf("Configured lane leg as source with %d txs", len(txs))

		return sequences.OnChainOutput{}, nil
	},
)

var ConfigureLaneLegAsDest = operations.NewSequence(
	"ConfigureLaneLegAsDest",
	semver.MustParse("1.6.0"),
	"Configures lane leg as dest on CCIP 1.6.0",
	func(b operations.Bundle, chains cldfChain.BlockChains, input lanes.UpdateLanesInput) (sequences.OnChainOutput, error) {
		var txs [][]byte

		deps, err := extractTonDeps(input)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to extract TON deps: %w", err)
		}

		// configure offramp sources
		updateOffRampSourcesConfig := intoUpdateOffRampSourcesConfig(input)
		b.Logger.Infow("Updating source configs on OffRamp", "input", updateOffRampSourcesConfig)
		offRampReport, err := operations.ExecuteOperation(b, operation.UpdateOffRampSourceChainConfigsOp, deps, updateOffRampSourcesConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update offramp sources: %w", err)
		}
		txs = append(txs, offRampReport.Output...)

		// add ccip owner to offramp allowlist

		// update router with destination onramp versions
		updateRouterDestConfig, err := intoUpdateRouterDestConfig(input)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to convert router dest config: %w", err)
		}
		b.Logger.Infow("Updating Router", "input", updateRouterDestConfig)
		routerReport, err := operations.ExecuteOperation(b, operation.UpdateRouterDestOp, deps, updateRouterDestConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update router: %w", err)
		}
		txs = append(txs, routerReport.Output...)

		// temporary fix for go-lint as txs is not used yet
		b.Logger.Debugf("Configured lane leg as source with %d txs", len(txs))

		return sequences.OnChainOutput{}, nil
	},
)

func extractTonDeps(input lanes.UpdateLanesInput) (operation.TonDeps, error) {
	onRampAddr, err := codec.AddressBytesToTONAddress(input.Source.OnRamp)
	if err != nil {
		return operation.TonDeps{}, fmt.Errorf("failed to convert onramp address: %w", err)
	}
	offRampAddr, err := codec.AddressBytesToTONAddress(input.Source.OffRamp)
	if err != nil {
		return operation.TonDeps{}, fmt.Errorf("failed to convert offramp address: %w", err)
	}
	routerAddr, err := codec.AddressBytesToTONAddress(input.Source.Router)
	if err != nil {
		return operation.TonDeps{}, fmt.Errorf("failed to convert router address: %w", err)
	}
	feeQuoterAddr, err := codec.AddressBytesToTONAddress(input.Source.FeeQuoter)
	if err != nil {
		return operation.TonDeps{}, fmt.Errorf("failed to convert feequoter address: %w", err)
	}

	// Only fill in the fields that are relevant to the operations used
	deps := operation.TonDeps{
		TonChain: ton.Chain{
			ChainMetadata: ton.ChainMetadata{
				Selector: input.Source.Selector,
			},
		},
		CCIPOnChainState: map[uint64]state.CCIPChainState{
			input.Source.Selector: {
				OnRamp:    *onRampAddr,
				OffRamp:   *offRampAddr,
				Router:    *routerAddr,
				FeeQuoter: *feeQuoterAddr,
			},
		},
	}
	return deps, nil
}

///////////////
/// Mappers ///
///////////////

func intoUpdateFeeQuoterDestChainConfigs(input lanes.UpdateLanesInput) operation.UpdateFeeQuoterDestChainConfigsInput {
	return []feequoter.UpdateDestChainConfig{
		{
			DestinationChainSelector: input.Dest.Selector,
			DestChainConfig: feequoter.DestChainConfig{
				IsEnabled:                         input.Dest.FeeQuoterDestChainConfig.IsEnabled,
				MaxNumberOfTokensPerMsg:           input.Dest.FeeQuoterDestChainConfig.MaxNumberOfTokensPerMsg,
				MaxDataBytes:                      input.Dest.FeeQuoterDestChainConfig.MaxDataBytes,
				MaxPerMsgGasLimit:                 input.Dest.FeeQuoterDestChainConfig.MaxPerMsgGasLimit,
				DestGasOverhead:                   input.Dest.FeeQuoterDestChainConfig.DestGasOverhead,
				DestGasPerPayloadByteBase:         input.Dest.FeeQuoterDestChainConfig.DestGasPerPayloadByteBase,
				DestGasPerPayloadByteHigh:         input.Dest.FeeQuoterDestChainConfig.DestGasPerPayloadByteHigh,
				DestGasPerPayloadByteThreshold:    input.Dest.FeeQuoterDestChainConfig.DestGasPerPayloadByteThreshold,
				DestDataAvailabilityOverheadGas:   input.Dest.FeeQuoterDestChainConfig.DestDataAvailabilityOverheadGas,
				DestGasPerDataAvailabilityByte:    input.Dest.FeeQuoterDestChainConfig.DestGasPerDataAvailabilityByte,
				DestDataAvailabilityMultiplierBps: input.Dest.FeeQuoterDestChainConfig.DestDataAvailabilityMultiplierBps,
				ChainFamilySelector:               input.Dest.FeeQuoterDestChainConfig.ChainFamilySelector,
				EnforceOutOfOrder:                 input.Dest.FeeQuoterDestChainConfig.EnforceOutOfOrder,
				DefaultTokenFeeUsdCents:           input.Dest.FeeQuoterDestChainConfig.DefaultTokenFeeUSDCents,
				DefaultTokenDestGasOverhead:       input.Dest.FeeQuoterDestChainConfig.DefaultTokenDestGasOverhead,
				DefaultTxGasLimit:                 input.Dest.FeeQuoterDestChainConfig.DefaultTxGasLimit,
				GasMultiplierWeiPerEth:            input.Dest.FeeQuoterDestChainConfig.GasMultiplierWeiPerEth,
				GasPriceStalenessThreshold:        input.Dest.FeeQuoterDestChainConfig.GasPriceStalenessThreshold,
				NetworkFeeUsdCents:                input.Dest.FeeQuoterDestChainConfig.NetworkFeeUSDCents,
			},
		},
	}
}

func intoUpdateOnRampDestChainConfigs(input lanes.UpdateLanesInput) operation.UpdateOnRampDestChainConfigsInput {
	return operation.UpdateOnRampDestChainConfigsInput{
		Updates: map[uint64]operation.OnRampDestinationUpdate{
			input.Dest.Selector: {
				IsEnabled:        !input.IsDisabled,
				TestRouter:       input.TestRouter,
				AllowListEnabled: input.Dest.AllowListEnabled,
			},
		},
	}
}

func intoUpdateFeeQuoterPricesConfig(input lanes.UpdateLanesInput) operation.UpdateFeeQuoterPricesInput {
	return operation.UpdateFeeQuoterPricesInput{
		TokenPrices: input.Dest.TokenPrices,
		GasPrices: map[uint64]operation.GasPrice{
			input.Dest.Selector: {
				ExecutionGasPrice:        input.Dest.GasPrice,
				DataAvailabilityGasPrice: input.Dest.GasPrice,
			},
		},
	}
}

func intoUpdateOffRampSourcesConfig(input lanes.UpdateLanesInput) operation.UpdateOffRampSourcesInput {
	return operation.UpdateOffRampSourcesInput{
		Updates: map[uint64]operation.OffRampSourceUpdate{
			input.Source.Selector: {
				IsEnabled:                 !input.IsDisabled,
				TestRouter:                input.TestRouter,
				IsRMNVerificationDisabled: !input.Source.RMNVerificationEnabled,
				OnRamp:                    input.Source.OnRamp,
			},
		},
	}
}

func intoUpdateRouterDestConfig(input lanes.UpdateLanesInput) (operation.UpdateRouterDestInput, error) {
	addressCodec := codec.NewAddressCodec()
	onRampAddrStr, err := addressCodec.AddressBytesToString(input.Dest.OnRamp)
	if err != nil {
		return nil, fmt.Errorf("failed to convert onramp address to string: %w", err)
	}

	return operation.UpdateRouterDestInput{
		onRampAddrStr: []router.DestChainSelector{
			{
				Value: input.Dest.Selector,
			},
		},
	}, nil
}

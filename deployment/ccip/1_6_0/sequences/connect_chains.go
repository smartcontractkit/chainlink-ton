package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	cldfChain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"
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

		chainSelector := input.Source.Selector
		tonChain := chains.TonChains()[chainSelector]

		deps, err := extractTonDeps(tonChain, input.Source)
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

		// update router with onramps
		updateRouterOnRampsConfig, err := intoUpdateRouterOnrampsConfig(input)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to convert router onramps config: %w", err)
		}
		b.Logger.Infow("Updating Router", "input", updateRouterOnRampsConfig)
		routerReport, err := operations.ExecuteOperation(b, operation.UpdateRouterOnrampsOp, deps, updateRouterOnRampsConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update router: %w", err)
		}
		txs = append(txs, routerReport.Output...)

		// Execute the txs || MCMS proposals
		err = helpers.ExecuteTransactions(b.GetContext(), b.Logger, deps.TonChain.Client, deps.TonChain.Wallet, txs)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		return sequences.OnChainOutput{}, nil
	},
)

var ConfigureLaneLegAsDest = operations.NewSequence(
	"ConfigureLaneLegAsDest",
	semver.MustParse("1.6.0"),
	"Configures lane leg as dest on CCIP 1.6.0",
	func(b operations.Bundle, chains cldfChain.BlockChains, input lanes.UpdateLanesInput) (sequences.OnChainOutput, error) {
		var txs [][]byte

		chainSelector := input.Dest.Selector
		tonChain := chains.TonChains()[chainSelector]

		deps, err := extractTonDeps(tonChain, input.Dest)
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

		// TODO update router with offramps. Let's add this functionality once vincent finishes the contract work

		updateRouterOffRampsConfig, err := intoUpdateRouterOfframpsConfig(input)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to convert router offramps config: %w", err)
		}
		b.Logger.Infow("Updating Router", "input", updateRouterOffRampsConfig)
		routerReport, err := operations.ExecuteOperation(b, operation.UpdateRouterOfframpsOp, deps, updateRouterOffRampsConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update router: %w", err)
		}
		txs = append(txs, routerReport.Output...)

		err = helpers.ExecuteTransactions(b.GetContext(), b.Logger, deps.TonChain.Client, deps.TonChain.Wallet, txs)
		if err != nil {
			return sequences.OnChainOutput{}, err
		}

		return sequences.OnChainOutput{}, nil
	},
)

func extractTonDeps(chain ton.Chain, chainDefinition *lanes.ChainDefinition) (operation.TonDeps, error) {
	onRampAddr, err := codec.AddressBytesToTONAddress(chainDefinition.OnRamp)
	if err != nil {
		return operation.TonDeps{}, fmt.Errorf("failed to convert onramp address: %w", err)
	}
	offRampAddr, err := codec.AddressBytesToTONAddress(chainDefinition.OffRamp)
	if err != nil {
		return operation.TonDeps{}, fmt.Errorf("failed to convert offramp address: %w", err)
	}
	routerAddr, err := codec.AddressBytesToTONAddress(chainDefinition.Router)
	if err != nil {
		return operation.TonDeps{}, fmt.Errorf("failed to convert router address: %w", err)
	}
	feeQuoterAddr, err := codec.AddressBytesToTONAddress(chainDefinition.FeeQuoter)
	if err != nil {
		return operation.TonDeps{}, fmt.Errorf("failed to convert feequoter address: %w", err)
	}

	// Only fill in the fields that are relevant to the operations used

	deps := operation.TonDeps{
		TonChain: chain,
		CCIPOnChainState: map[uint64]state.CCIPChainState{
			chain.Selector: {
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

// TODO change the operation input to lanes.UpdateLanesInput
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
		TokenPrices: input.Source.TokenPrices,
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

func intoUpdateRouterOnrampsConfig(input lanes.UpdateLanesInput) (operation.UpdateRouterOnrampsInput, error) {
	addressCodec := codec.NewAddressCodec()
	onRampAddrStr, err := addressCodec.AddressBytesToString(input.Source.OnRamp)
	if err != nil {
		return nil, fmt.Errorf("failed to convert onramp address to string: %w", err)
	}

	return operation.UpdateRouterOnrampsInput{
		onRampAddrStr: []router.ChainSelector{
			{
				Value: input.Dest.Selector,
			},
		},
	}, nil
}

func intoUpdateRouterOfframpsConfig(input lanes.UpdateLanesInput) (operation.UpdateRouterOfframpsInput, error) {
	addressCodec := codec.NewAddressCodec()
	offRampAddrStr, err := addressCodec.AddressBytesToString(input.Dest.OffRamp)
	if err != nil {
		return operation.UpdateRouterOfframpsInput{}, fmt.Errorf("failed to convert offramp address to string: %w", err)
	}

	return operation.UpdateRouterOfframpsInput{
		OffRampAdd: map[string][]router.ChainSelector{
			offRampAddrStr: []router.ChainSelector{
				{
					Value: input.Source.Selector,
				},
			},
		},
		OffRampRemove: nil,
	}, nil
}

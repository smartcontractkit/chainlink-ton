package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	chain_selectors "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	ccipapi "github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"
	"github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldfChain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	cldfOps "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
)

// TODO: why is it that this methods don't have the env as a parameter?
func (a *TonAdapter) ConfigureLaneLegAsSource(env *cldf.Environment) *cldfOps.Sequence[ccipapi.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return cldfOps.NewSequence[ccipapi.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains](
		"ConfigureLaneLegAsSource",
		semver.MustParse("1.0.0"),
		"Configures lane leg as source on CCIP 1.6.0",
		func(b operations.Bundle, chains cldfChain.BlockChains, input lanes.UpdateLanesInput) (sequences.OnChainOutput, error) {
			var txs [][]byte

			// TODO: What should go here?
			tonChainSelectors := env.BlockChains.ListChainSelectors(chain.WithFamily(chain_selectors.FamilyTon))
			chainSelector := tonChainSelectors[0]

			tonChains := env.BlockChains.TonChains()
			chain := tonChains[chainSelector]
			states, err := state.LoadOnchainState(*env)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to load TON onchain state: %w", err)
			}
			deps := operation.TonDeps{
				TonChain:         chain,
				CCIPOnChainState: states,
			}

			// update fee quoter with dest chain configs
			updateFeeQuoterDestChainConfigs := mapToUpdateFeeQuoterDestChainConfigs(input)
			b.Logger.Infow("Updating destination configs on FeeQuoter", "input", updateFeeQuoterDestChainConfigs)
			feeQuoterReport, err := operations.ExecuteOperation(b, operation.UpdateFeeQuoterDestChainConfigsOp, deps, updateFeeQuoterDestChainConfigs)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update feequoter destinations: %w", err)
			}
			txs = append(txs, feeQuoterReport.Output...)

			// update onramp with dest chain configs
			updateOnRampDestChainConfigs := mapToUpdateOnRampDestChainConfigs(input)
			b.Logger.Infow("Updating destination configs on OnRamp", "input", updateOnRampDestChainConfigs)
			onRampReport, err := operations.ExecuteOperation(b, operation.UpdateOnRampDestChainConfigsOp, deps, updateOnRampDestChainConfigs)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update onramp destinations: %w", err)
			}
			txs = append(txs, onRampReport.Output...)

			// update fee quoter with gas prices
			updateFeeQuoterPricesConfig := mapToUpdateFeeQuoterPricesConfig(input)
			b.Logger.Infow("Updating prices on FeeQuoter", "input", updateFeeQuoterPricesConfig)
			updatePricesReport, err := operations.ExecuteOperation(b, operation.UpdateFeeQuoterPricesOp, deps, updateFeeQuoterPricesConfig)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update feequoter prices: %w", err)
			}
			txs = append(txs, updatePricesReport.Output...)

			return sequences.OnChainOutput{}, nil
		},
	)
}

func (a *TonAdapter) ConfigureLaneLegAsDest() *cldfOps.Sequence[ccipapi.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return nil // Not implemented for Ton
}

func mapToUpdateFeeQuoterDestChainConfigs(input lanes.UpdateLanesInput) operation.UpdateFeeQuoterDestChainConfigsInput {
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

func mapToUpdateOnRampDestChainConfigs(input ccipapi.UpdateLanesInput) operation.UpdateOnRampDestChainConfigsInput {
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

func mapToUpdateFeeQuoterPricesConfig(input ccipapi.UpdateLanesInput) operation.UpdateFeeQuoterPricesInput {
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

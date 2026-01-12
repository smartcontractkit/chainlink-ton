package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/tlb"

	cldfChain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	ccipcodec "github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"
)

func (a *TonAdapter) ConfigureLaneLegAsSource() *operations.Sequence[lanes.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return ConfigureLaneLegAsSource
}

func (a *TonAdapter) ConfigureLaneLegAsDest() *operations.Sequence[lanes.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return ConfigureLaneLegAsDest
}

// TODO: this product level API is designed to always plan and return output.BatchOps
var ConfigureLaneLegAsSource = operations.NewSequence(
	"ConfigureLaneLegAsSource",
	semver.MustParse("1.6.0"),
	"Configures lane leg as source on CCIP 1.6.0",
	func(b operations.Bundle, chains cldfChain.BlockChains, input lanes.UpdateLanesInput) (sequences.OnChainOutput, error) {
		msgs := make([]*tlbe.Cell[tlb.InternalMessage], 0)

		chainSelector := input.Source.Selector
		tonChain := chains.TonChains()[chainSelector]

		deps, err := extractTonDepsFrom(tonChain, input.Source.OnRamp, input.Source.OffRamp, input.Source.Router, input.Source.FeeQuoter)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to extract TON deps: %w", err)
		}

		// TODO (ops): improve deps passing
		opdeps := opston.SendMessagesDeps{
			Wallet: tonChain.Wallet,
			Client: tonChain.Client,
		}

		// update fee quoter with dest chain configs
		{
			updates := intoUpdateFeeQuoterDestChainConfigs(input)
			b.Logger.Infow("Updating destination configs on FeeQuoter", "input", updates)

			// Skip if there's no updates
			if len(updates) != 0 {
				addr := deps.CCIPOnChainState[deps.TonChain.Selector].FeeQuoter
				body := feequoter.UpdateDestChainConfigs{Updates: updates}

				r, err := cldf_ops.ExecuteOperation(b, opston.SendMessages, opdeps, opston.SendMessagesInput{
					Messages: []opston.InternalMessage[any]{
						{
							Bounce:  true,
							DstAddr: &addr,
							Amount:  tlb.MustFromTON("0.1"), // TODO (ops/gas): static, should allow overrides?
							Body:    codec.MustWrapMessage[any](bindings.PkgCCIP+".FeeQuoter", body),
						},
					},
					Plan: true,
				})
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
				}

				msgs = append(msgs, opston.AsCells(r.Output.Plans)...)
			}
		}

		// update onramp with dest chain configs
		{
			// TODO (ops/ccip): !input.IsDisabled
			// TODO (ops/ccip): input.TestRouter
			router := deps.CCIPOnChainState[deps.TonChain.Selector].Router
			updates := []onramp.UpdateDestChainConfig{
				{
					DestinationChainSelector: input.Dest.Selector,
					Router:                   &router,
					AllowListEnabled:         input.Dest.AllowListEnabled,
				},
			}
			b.Logger.Infow("Updating destination configs on OnRamp", "input", updates)

			// Skip if there's no updates
			if len(updates) != 0 {
				// Set Router addr from state for all updates which don't have it set
				for _, u := range updates {
					// TODO: TestRouter support
					if u.Router == nil {
						router := deps.CCIPOnChainState[deps.TonChain.Selector].Router
						u.Router = &router
					}
				}

				addr := deps.CCIPOnChainState[deps.TonChain.Selector].OnRamp
				body := onramp.UpdateDestChainConfigsMessage{Updates: updates}

				r, err := cldf_ops.ExecuteOperation(b, opston.SendMessages, opdeps, opston.SendMessagesInput{
					Messages: []opston.InternalMessage[any]{
						{
							Bounce:  true,
							DstAddr: &addr,
							Amount:  tlb.MustFromTON("0.1"), // TODO (ops/gas): static, should allow overrides?
							Body:    codec.MustWrapMessage[any](bindings.PkgCCIP+".OnRamp", body),
						},
					},
					Plan: true,
				})
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
				}

				msgs = append(msgs, opston.AsCells(r.Output.Plans)...)
			}
		}

		// update fee quoter with gas prices
		updateFeeQuoterPricesConfig := intoUpdateFeeQuoterPricesConfig(input)
		b.Logger.Infow("Updating prices on FeeQuoter", "input", updateFeeQuoterPricesConfig)
		updatePricesReport, err := operations.ExecuteOperation(b, operation.UpdateFeeQuoterPricesOp, deps, updateFeeQuoterPricesConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update feequoter prices: %w", err)
		}
		msgs = append(msgs, updatePricesReport.Output...)

		// update router with onramps
		applyRampUpdatesConfig, err := intoUpdateRouterOnrampsConfig(input)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to convert router onramps config: %w", err)
		}
		b.Logger.Infow("Updating Router Onramps", "input", applyRampUpdatesConfig)
		routerReport, err := operations.ExecuteOperation(b, operation.ApplyRampUpdatesOp, deps, applyRampUpdatesConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update router: %w", err)
		}
		msgs = append(msgs, routerReport.Output...)

		if len(msgs) != 0 {
			_, err := operations.ExecuteOperation(b, ton.SendMessagesRaw, opdeps, ton.SendMessagesRawInput{Messages: msgs})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to send messages: %w", err)
			}
		}

		return sequences.OnChainOutput{}, nil
	},
)

var ConfigureLaneLegAsDest = operations.NewSequence(
	"ConfigureLaneLegAsDest",
	semver.MustParse("1.6.0"),
	"Configures lane leg as dest on CCIP 1.6.0",
	func(b operations.Bundle, chains cldfChain.BlockChains, input lanes.UpdateLanesInput) (sequences.OnChainOutput, error) {
		msgs := make([]*tlbe.Cell[tlb.InternalMessage], 0)

		chainSelector := input.Dest.Selector
		tonChain := chains.TonChains()[chainSelector]

		deps, err := extractTonDepsFrom(tonChain, input.Dest.OnRamp, input.Dest.OffRamp, input.Dest.Router, input.Dest.FeeQuoter)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to extract TON deps: %w", err)
		}
		// TODO (ops): improve deps passing
		opdeps := opston.SendMessagesDeps{
			Wallet: tonChain.Wallet,
			Client: tonChain.Client,
		}

		// configure offramp sources
		updateOffRampSourcesConfig := intoUpdateOffRampSourcesConfig(input)
		b.Logger.Infow("Updating source configs on OffRamp", "input", updateOffRampSourcesConfig)
		offRampReport, err := operations.ExecuteOperation(b, operation.UpdateOffRampSourceChainConfigsOp, deps, updateOffRampSourcesConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update offramp sources: %w", err)
		}
		msgs = append(msgs, offRampReport.Output...)

		applyRampUpdatesConfig, err := intoUpdateRouterOfframpsConfig(input)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to convert router offramps config: %w", err)
		}
		b.Logger.Infow("Updating Router OffRamps", "input", applyRampUpdatesConfig)
		routerReport, err := operations.ExecuteOperation(b, operation.ApplyRampUpdatesOp, deps, applyRampUpdatesConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update router: %w", err)
		}
		msgs = append(msgs, routerReport.Output...)

		if len(msgs) != 0 {
			_, err := operations.ExecuteOperation(b, ton.SendMessagesRaw, opdeps, ton.SendMessagesRawInput{Messages: msgs})
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to send messages: %w", err)
			}
		}

		return sequences.OnChainOutput{}, nil
	},
)

///////////////
/// Mappers ///
///////////////

// TODO change the operation input to lanes.UpdateLanesInput
func intoUpdateFeeQuoterDestChainConfigs(input lanes.UpdateLanesInput) []feequoter.UpdateDestChainConfig {
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

func intoUpdateRouterOnrampsConfig(input lanes.UpdateLanesInput) (operation.ApplyRampUpdatesInput, error) {
	addressCodec := ccipcodec.NewAddressCodec()
	onRampAddrStr, err := addressCodec.AddressBytesToString(input.Source.OnRamp)
	if err != nil {
		return operation.ApplyRampUpdatesInput{}, fmt.Errorf("failed to convert onramp address to string: %w", err)
	}

	return operation.ApplyRampUpdatesInput{
		OnRampUpdates: operation.RampUpdates{
			onRampAddrStr: {
				{
					Value: input.Dest.Selector,
				},
			},
		},
	}, nil
}

func intoUpdateRouterOfframpsConfig(input lanes.UpdateLanesInput) (operation.ApplyRampUpdatesInput, error) {
	addressCodec := ccipcodec.NewAddressCodec()
	offRampAddrStr, err := addressCodec.AddressBytesToString(input.Dest.OffRamp)
	if err != nil {
		return operation.ApplyRampUpdatesInput{}, fmt.Errorf("failed to convert offramp address to string: %w", err)
	}

	return operation.ApplyRampUpdatesInput{
		OffRampAdds: operation.RampUpdates{
			offRampAddrStr: {
				{
					Value: input.Source.Selector,
				},
			},
		},
		OffRampRemoves: nil,
	}, nil
}

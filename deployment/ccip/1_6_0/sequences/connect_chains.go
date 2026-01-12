package sequences

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/tlb"

	cldfChain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	ccipcodec "github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
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
		sender := tonChain.Wallet.Address()

		_inputMCMS := mcms.NewSendOrPlanInput(types.ChainSelector(chainSelector))

		// update fee quoter with dest chain configs
		{
			updates := intoUpdateFeeQuoterDestChainConfigs(input)
			b.Logger.Infow("Updating destination configs on FeeQuoter", "input", updates)

			// Skip if there's no updates
			if len(updates) != 0 {
				addr := deps.CCIPOnChainState[deps.TonChain.Selector].FeeQuoter
				body := feequoter.UpdateDestChainConfigs{Updates: updates}

				owner, err := tvm.CallGetterLatest(b.GetContext(), tonChain.Client, &addr, ownable2step.GetOwner)
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to get feequoter owner: %w", err)
				}

				contractType := bindings.PkgCCIP + ".FeeQuoter"
				r, err := cldf_ops.ExecuteOperation(b, opston.SendMessages, opdeps, opston.SendMessagesInput{
					Messages: []opston.InternalMessage[any]{
						{
							Bounce:  true,
							DstAddr: &addr,
							Amount:  tlb.MustFromTON("0.1"), // TODO (ops/gas): static, should allow overrides?
							Body:    codec.MustWrapMessage[any](contractType, body),
						},
					},
					Plan: true, // plan to construct a batch
				})
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
				}

				plan := sender.Equals(owner) != true // plan if sender is not owner
				_inputMCMS.Add(opston.AsCells(r.Output.Plans), plan, []types.OperationMetadata{
					{
						ContractType: contractType,
						Tags:         []string{},
					},
				})
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

				owner, err := tvm.CallGetterLatest(b.GetContext(), tonChain.Client, &addr, ownable2step.GetOwner)
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to get onramp owner: %w", err)
				}

				contractType := bindings.PkgCCIP + ".OnRamp"
				r, err := cldf_ops.ExecuteOperation(b, opston.SendMessages, opdeps, opston.SendMessagesInput{
					Messages: []opston.InternalMessage[any]{
						{
							Bounce:  true,
							DstAddr: &addr,
							Amount:  tlb.MustFromTON("0.1"), // TODO (ops/gas): static, should allow overrides?
							Body:    codec.MustWrapMessage[any](contractType, body),
						},
					},
					Plan: true,
				})
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to exec send messages operation: %w", err)
				}

				plan := sender.Equals(owner) != true // plan if sender is not owner
				_inputMCMS.Add(opston.AsCells(r.Output.Plans), plan, []types.OperationMetadata{
					{
						ContractType: contractType,
						Tags:         []string{},
					},
				})
			}
		}

		// update fee quoter with gas prices
		{
			_input := intoUpdateFeeQuoterPricesConfig(input)
			b.Logger.Infow("Updating prices on FeeQuoter", "input", _input)
			r, err := operations.ExecuteOperation(b, operation.UpdateFeeQuoterPricesOp, deps, _input)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update feequoter prices: %w", err)
			}

			contractType := bindings.PkgCCIP + ".FeeQuoter"
			addr := deps.CCIPOnChainState[deps.TonChain.Selector].FeeQuoter

			owner, err := tvm.CallGetterLatest(b.GetContext(), tonChain.Client, &addr, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get feequoter owner: %w", err)
			}

			plan := sender.Equals(owner) != true // plan if sender is not owner
			_inputMCMS.Add(r.Output, plan, []types.OperationMetadata{
				{
					ContractType: contractType,
					Tags:         []string{},
				},
			})
		}

		// update router with onramps
		{
			_input, err := intoUpdateRouterOnrampsConfig(input)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to convert router onramps config: %w", err)
			}
			b.Logger.Infow("Updating Router Onramps", "input", _input)
			r, err := operations.ExecuteOperation(b, operation.ApplyRampUpdatesOp, deps, _input)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update router: %w", err)
			}

			contractType := bindings.PkgCCIP + ".Router"
			addr := deps.CCIPOnChainState[deps.TonChain.Selector].Router

			owner, err := tvm.CallGetterLatest(b.GetContext(), tonChain.Client, &addr, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get router owner: %w", err)
			}

			plan := sender.Equals(owner) != true // plan if sender is not owner
			_inputMCMS.Add(r.Output, plan, []types.OperationMetadata{
				{
					ContractType: contractType,
					Tags:         []string{},
				},
			})
		}

		r, err := operations.ExecuteOperation(b, mcms.SendOrPlan, tonChain, _inputMCMS)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to send or plan messages: %w", err)
		}

		return r.Output, nil
	},
)

var ConfigureLaneLegAsDest = operations.NewSequence(
	"ConfigureLaneLegAsDest",
	semver.MustParse("1.6.0"),
	"Configures lane leg as dest on CCIP 1.6.0",
	func(b operations.Bundle, chains cldfChain.BlockChains, input lanes.UpdateLanesInput) (sequences.OnChainOutput, error) {
		chainSelector := input.Dest.Selector
		tonChain := chains.TonChains()[chainSelector]

		deps, err := extractTonDepsFrom(tonChain, input.Dest.OnRamp, input.Dest.OffRamp, input.Dest.Router, input.Dest.FeeQuoter)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to extract TON deps: %w", err)
		}

		sender := tonChain.Wallet.Address()

		_inputMCMS := mcms.NewSendOrPlanInput(types.ChainSelector(chainSelector))

		// configure offramp sources
		{
			updateOffRampSourcesConfig := intoUpdateOffRampSourcesConfig(input)
			b.Logger.Infow("Updating source configs on OffRamp", "input", updateOffRampSourcesConfig)
			r, err := operations.ExecuteOperation(b, operation.UpdateOffRampSourceChainConfigsOp, deps, updateOffRampSourcesConfig)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update offramp sources: %w", err)
			}

			addr := deps.CCIPOnChainState[deps.TonChain.Selector].OffRamp
			contractType := bindings.PkgCCIP + ".OffRamp"
			owner, err := tvm.CallGetterLatest(b.GetContext(), tonChain.Client, &addr, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get offramp owner: %w", err)
			}

			plan := sender.Equals(owner) != true // plan if sender is not owner
			_inputMCMS.Add(r.Output, plan, []types.OperationMetadata{
				{
					ContractType: contractType,
					Tags:         []string{},
				},
			})
		}

		{
			applyRampUpdatesConfig, err := intoUpdateRouterOfframpsConfig(input)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to convert router offramps config: %w", err)
			}
			b.Logger.Infow("Updating Router OffRamps", "input", applyRampUpdatesConfig)
			r, err := operations.ExecuteOperation(b, operation.ApplyRampUpdatesOp, deps, applyRampUpdatesConfig)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update router: %w", err)
			}

			addr := deps.CCIPOnChainState[deps.TonChain.Selector].Router
			contractType := bindings.PkgCCIP + ".Router"
			owner, err := tvm.CallGetterLatest(b.GetContext(), tonChain.Client, &addr, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get router owner: %w", err)
			}

			plan := sender.Equals(owner) != true // plan if sender is not owner
			_inputMCMS.Add(r.Output, plan, []types.OperationMetadata{
				{
					ContractType: contractType,
					Tags:         []string{},
				},
			})
		}

		r, err := operations.ExecuteOperation(b, mcms.SendOrPlan, tonChain, _inputMCMS)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to send or plan messages: %w", err)
		}

		return r.Output, nil
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

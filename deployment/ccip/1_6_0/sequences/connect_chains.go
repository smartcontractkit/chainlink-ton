package sequences

import (
	"fmt"
	"math/big"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/state"

	cldfChain "github.com/smartcontractkit/chainlink-deployments-framework/chain"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ccip/deployment/lanes"
	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	ccipcodec "github.com/smartcontractkit/chainlink-ton/pkg/ccip/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
)

// TonLaneAdapter implements the lanes.LaneAdapter interface for TON chains.
type TonLaneAdapter struct{}

func (a *TonLaneAdapter) GetOnRampAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	return getOnRampAddress(ds, chainSelector)
}

func (a *TonLaneAdapter) GetOffRampAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	return getOffRampAddress(ds, chainSelector)
}

func (a *TonLaneAdapter) GetFQAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	return getFQAddress(ds, chainSelector)
}

func (a *TonLaneAdapter) GetRouterAddress(ds datastore.DataStore, chainSelector uint64) ([]byte, error) {
	return getRouterAddress(ds, chainSelector)
}

func (a *TonLaneAdapter) GetFeeQuoterDestChainConfig() lanes.FeeQuoterDestChainConfig {
	return lanes.FeeQuoterDestChainConfig{
		IsEnabled:                   true,
		MaxDataBytes:                30_000,
		MaxPerMsgGasLimit:           4_200_000_000, // 4_200_000_000 nano TON = 4.2 TON
		DestGasOverhead:             300_000,
		DestGasPerPayloadByteBase:   16,
		ChainFamilySelector:         config.TVMFamilySelector,
		DefaultTokenFeeUSDCents:     25,
		DefaultTokenDestGasOverhead: 90_000,
		DefaultTxGasLimit:           200_000,
		NetworkFeeUSDCents:          10,
		V1Params: &lanes.FeeQuoterV1Params{
			MaxNumberOfTokensPerMsg:           10,
			DestGasPerPayloadByteHigh:         40,
			DestGasPerPayloadByteThreshold:    3000,
			DestDataAvailabilityOverheadGas:   100,
			DestGasPerDataAvailabilityByte:    16,
			DestDataAvailabilityMultiplierBps: 1,
			GasMultiplierWeiPerEth:            11e17,
		},
	}
}

func (a *TonLaneAdapter) GetDefaultGasPrice() *big.Int {
	// 1 TON ~2.13 USD -> 1 nanoTON = 2.13e-9 USD -> 1 nanoTON expressed in 1e18 (1 USD) = 2.13e9
	return big.NewInt(2.12e9)
}

func (a *TonLaneAdapter) GetDefaultTokenPrices() map[datastore.ContractType]*big.Int {
	defaultLinkPrice := new(big.Int).Mul(big.NewInt(20), big.NewInt(1e18))
	defaultTONPrice := new(big.Int).Mul(new(big.Int).Mul(big.NewInt(2), big.NewInt(1e18)), big.NewInt(1e9)) // 2e18 * 1e9 = 2e27, 2 is approx USD price of TON
	return map[datastore.ContractType]*big.Int{
		state.LinkToken: defaultLinkPrice,
		state.TONNative: defaultTONPrice,
	}
}

func (a *TonLaneAdapter) ConfigureLaneLegAsSource() *cldf_ops.Sequence[lanes.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return ConfigureLaneLegAsSource
}

func (a *TonLaneAdapter) ConfigureLaneLegAsDest() *cldf_ops.Sequence[lanes.UpdateLanesInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	return ConfigureLaneLegAsDest
}

func (a *TonLaneAdapter) DisableRemoteChain() *cldf_ops.Sequence[lanes.DisableRemoteChainInput, sequences.OnChainOutput, cldfChain.BlockChains] {
	panic("DisableRemoteChain not implemented for TON")
}

var ConfigureLaneLegAsSource = cldf_ops.NewSequence(
	"ton/sequences/ccip/tooling-api/configure-lane-leg-as-source",
	semver.MustParse("1.6.0"),
	"Configures lane leg as source on CCIP 1.6.0",
	func(b cldf_ops.Bundle, chains cldfChain.BlockChains, input lanes.UpdateLanesInput) (sequences.OnChainOutput, error) {
		chainSelector := input.Source.Selector
		chain := chains.TonChains()[chainSelector]

		stateCCIP, err := extractCCIPChainStateFrom(input.Source.OnRamp, input.Source.OffRamp, input.Source.Router, input.Source.FeeQuoter)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to extract TON deps: %w", err)
		}

		dp, err := dep.NewDependencyProvider(
			dep.Provide(chain),
			dep.Provide(stateCCIP),
		)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
		}

		sender := chain.Wallet.Address()
		_inputMCMS := mcms.NewSendOrPlanInput(types.ChainSelector(chainSelector))

		// update fee quoter with dest chain configs
		{
			updates := intoUpdateFeeQuoterDestChainConfigs(input)
			b.Logger.Infow("Updating destination configs on FeeQuoter", "input", updates)

			// Skip if there's no updates
			if len(updates) != 0 {
				addr := stateCCIP.FeeQuoter
				body := feequoter.UpdateDestChainConfigs{Updates: updates}

				//nolint:govet // allow shadowing
				owner, err := tvm.CallGetterLatest(b.GetContext(), chain.Client, &addr, ownable2step.GetOwner)
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to get feequoter owner: %w", err)
				}

				contractType := bindings.PkgCCIP + ".FeeQuoter"
				r, err := cldf_ops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
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

				plan := !sender.Equals(owner) // plan if sender is not owner
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
			router := stateCCIP.Router
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
						u.Router = &stateCCIP.Router
					}
				}

				addr := stateCCIP.OnRamp
				body := onramp.UpdateDestChainConfigsMessage{Updates: updates}

				//nolint:govet // allow shadowing
				owner, err := tvm.CallGetterLatest(b.GetContext(), chain.Client, &addr, ownable2step.GetOwner)
				if err != nil {
					return sequences.OnChainOutput{}, fmt.Errorf("failed to get onramp owner: %w", err)
				}

				contractType := bindings.PkgCCIP + ".OnRamp"
				r, err := cldf_ops.ExecuteOperation(b, opston.SendMessages, dp, opston.SendMessagesInput{
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

				plan := !sender.Equals(owner) // plan if sender is not owner
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
			//nolint:govet // allow shadowing
			r, err := cldf_ops.ExecuteOperation(b, operation.UpdateFeeQuoterPricesOp, dp, _input)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update feequoter prices: %w", err)
			}

			addr := stateCCIP.FeeQuoter
			contractType := bindings.PkgCCIP + ".FeeQuoter"

			owner, err := tvm.CallGetterLatest(b.GetContext(), chain.Client, &addr, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get feequoter owner: %w", err)
			}

			plan := !sender.Equals(owner) // plan if sender is not owner
			_inputMCMS.Add(r.Output, plan, []types.OperationMetadata{
				{
					ContractType: contractType,
					Tags:         []string{},
				},
			})
		}

		// update router with onramps
		{
			//nolint:govet // allow shadowing
			_input, err := intoUpdateRouterOnrampsConfig(input)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to convert router onramps config: %w", err)
			}
			b.Logger.Infow("Updating Router Onramps", "input", _input)
			r, err := cldf_ops.ExecuteOperation(b, operation.ApplyRampUpdatesOp, dp, _input)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update router: %w", err)
			}

			addr := stateCCIP.Router
			contractType := bindings.PkgCCIP + ".Router"

			owner, err := tvm.CallGetterLatest(b.GetContext(), chain.Client, &addr, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get router owner: %w", err)
			}

			plan := !sender.Equals(owner) // plan if sender is not owner
			_inputMCMS.Add(r.Output, plan, []types.OperationMetadata{
				{
					ContractType: contractType,
					Tags:         []string{},
				},
			})
		}

		r, err := cldf_ops.ExecuteOperation(b, mcms.SendOrPlan, dp, _inputMCMS)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to send or plan messages: %w", err)
		}

		return r.Output, nil
	},
)

var ConfigureLaneLegAsDest = cldf_ops.NewSequence(
	"ton/sequences/ccip/tooling-api/configure-lane-leg-as-dest",
	semver.MustParse("1.6.0"),
	"Configures lane leg as dest on CCIP 1.6.0",
	func(b cldf_ops.Bundle, chains cldfChain.BlockChains, input lanes.UpdateLanesInput) (sequences.OnChainOutput, error) {
		chainSelector := input.Dest.Selector
		chain := chains.TonChains()[chainSelector]

		stateCCIP, err := extractCCIPChainStateFrom(input.Dest.OnRamp, input.Dest.OffRamp, input.Dest.Router, input.Dest.FeeQuoter)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to extract TON deps: %w", err)
		}

		dp, err := dep.NewDependencyProvider(
			dep.Provide(chain),
			dep.Provide(stateCCIP),
		)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to create dependency provider: %w", err)
		}

		sender := chain.Wallet.Address()
		_inputMCMS := mcms.NewSendOrPlanInput(types.ChainSelector(chainSelector))

		// configure offramp sources
		{
			_input := intoUpdateOffRampSourcesConfig(input)
			b.Logger.Infow("Updating source configs on OffRamp", "input", _input)
			//nolint:govet // allow shadowing
			r, err := cldf_ops.ExecuteOperation(b, operation.UpdateOffRampSourceChainConfigsOp, dp, _input)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update offramp sources: %w", err)
			}

			contractType := bindings.PkgCCIP + ".OffRamp"
			owner, err := tvm.CallGetterLatest(b.GetContext(), chain.Client, &stateCCIP.OffRamp, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get offramp owner: %w", err)
			}

			plan := !sender.Equals(owner) // plan if sender is not owner
			_inputMCMS.Add(r.Output, plan, []types.OperationMetadata{
				{
					ContractType: contractType,
					Tags:         []string{},
				},
			})
		}

		{
			//nolint:govet // allow shadowing
			_input, err := intoUpdateRouterOfframpsConfig(input)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to convert router offramps config: %w", err)
			}
			b.Logger.Infow("Updating Router OffRamps", "input", _input)
			r, err := cldf_ops.ExecuteOperation(b, operation.ApplyRampUpdatesOp, dp, _input)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to update router: %w", err)
			}

			contractType := bindings.PkgCCIP + ".Router"
			owner, err := tvm.CallGetterLatest(b.GetContext(), chain.Client, &stateCCIP.Router, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get router owner: %w", err)
			}

			plan := !sender.Equals(owner) // plan if sender is not owner
			_inputMCMS.Add(r.Output, plan, []types.OperationMetadata{
				{
					ContractType: contractType,
					Tags:         []string{},
				},
			})
		}

		r, err := cldf_ops.ExecuteOperation(b, mcms.SendOrPlan, dp, _inputMCMS)
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
	fqc := input.Dest.FeeQuoterDestChainConfig
	var v1 lanes.FeeQuoterV1Params
	if fqc.V1Params != nil {
		v1 = *fqc.V1Params
	}
	return []feequoter.UpdateDestChainConfig{
		{
			DestinationChainSelector: input.Dest.Selector,
			DestChainConfig: feequoter.DestChainConfig{
				IsEnabled:                         fqc.IsEnabled,
				MaxNumberOfTokensPerMsg:           v1.MaxNumberOfTokensPerMsg,
				MaxDataBytes:                      fqc.MaxDataBytes,
				MaxPerMsgGasLimit:                 fqc.MaxPerMsgGasLimit,
				DestGasOverhead:                   fqc.DestGasOverhead,
				DestGasPerPayloadByteBase:         fqc.DestGasPerPayloadByteBase,
				DestGasPerPayloadByteHigh:         v1.DestGasPerPayloadByteHigh,
				DestGasPerPayloadByteThreshold:    v1.DestGasPerPayloadByteThreshold,
				DestDataAvailabilityOverheadGas:   v1.DestDataAvailabilityOverheadGas,
				DestGasPerDataAvailabilityByte:    v1.DestGasPerDataAvailabilityByte,
				DestDataAvailabilityMultiplierBps: v1.DestDataAvailabilityMultiplierBps,
				ChainFamilySelector:               fqc.ChainFamilySelector,
				DefaultTokenFeeUsdCents:           fqc.DefaultTokenFeeUSDCents,
				DefaultTokenDestGasOverhead:       fqc.DefaultTokenDestGasOverhead,
				DefaultTxGasLimit:                 fqc.DefaultTxGasLimit,
				GasMultiplierWeiPerEth:            v1.GasMultiplierWeiPerEth,
				GasPriceStalenessThreshold:        v1.GasPriceStalenessThreshold,
				NetworkFeeUsdCents:                uint32(fqc.NetworkFeeUSDCents),
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

var _ lanes.LaneAdapter = &TonLaneAdapter{}

package sequence

import (
	"fmt"
	"maps"
	"math/big"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	chainsel "github.com/smartcontractkit/chain-selectors"

	"github.com/smartcontractkit/mcms/types"

	"github.com/smartcontractkit/chainlink-ccip/deployment/utils/sequences"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/ownable2step"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"

	ccipConfig "github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/mcms"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"
)

type UpdateTonLanesSeqInput struct {
	UpdateFeeQuoterDestChainConfigs []feequoter.UpdateDestChainConfig
	UpdateFeeQuoterPricesConfig     operation.UpdateFeeQuoterPricesInput
	UpdateOnRampDestChainConfigs    []onramp.UpdateDestChainConfig
	UpdateOffRampSourcesConfig      operation.UpdateOffRampSourcesInput
	ApplyRampUpdatesConfig          operation.ApplyRampUpdatesInput
}

var UpdateTonLanesSequence = cldf_ops.NewSequence(
	"ton/sequences/ccip/update-lanes",
	semver.MustParse("0.1.0"),
	"Configures a lane",
	updateLanes,
)

func updateLanes(b cldf_ops.Bundle, dp *dep.DependencyProvider, in UpdateTonLanesSeqInput) (sequences.OnChainOutput, error) {
	chain, err := dep.Resolve[cldf_ton.Chain](dp)
	if err != nil {
		return sequences.OnChainOutput{}, fmt.Errorf("failed to resolve chain: %w", err)
	}

	stateCCIP, err := dep.Resolve[tonstate.CCIPChainState](dp)
	if err != nil {
		return sequences.OnChainOutput{}, fmt.Errorf("failed to resolve ton ccip state: %w", err)
	}

	sender := chain.Wallet.Address()

	selector := chain.Selector
	_inputMCMS := mcms.NewSendOrPlanInput(types.ChainSelector(selector))

	// update fee quoter with dest chain configs
	{
		updates := in.UpdateFeeQuoterDestChainConfigs
		b.Logger.Infow("Updating destination configs on FeeQuoter", "input", updates)

		// Skip if there's no updates
		if len(updates) != 0 {
			contractType := bindings.PkgCCIP + ".FeeQuoter"
			addr := stateCCIP.FeeQuoter
			body := feequoter.UpdateDestChainConfigs{Updates: updates}

			//nolint:govet // allow shadowing
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

			owner, err := tvm.CallGetterLatest(b.GetContext(), chain.Client, &addr, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get router owner: %w", err)
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
		updates := in.UpdateOnRampDestChainConfigs
		b.Logger.Infow("Updating destination configs on OnRamp", "input", updates)

		// Skip if there's no updates
		if len(updates) != 0 {
			// Set Router addr from state for all updates which don't have it set
			for _, u := range updates {
				// TODO: TestRouter support
				if u.Router == nil {
					router := stateCCIP.Router
					u.Router = &router
				}
			}

			contractType := bindings.PkgCCIP + ".OnRamp"
			addr := stateCCIP.OnRamp
			body := onramp.UpdateDestChainConfigsMessage{Updates: updates}

			//nolint:govet // allow shadowing
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

			owner, err := tvm.CallGetterLatest(b.GetContext(), chain.Client, &addr, ownable2step.GetOwner)
			if err != nil {
				return sequences.OnChainOutput{}, fmt.Errorf("failed to get router owner: %w", err)
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

	// configure offramp sources
	{
		b.Logger.Infow("Updating source configs on OffRamp", "input", in.UpdateOffRampSourcesConfig)
		//nolint:govet // allow shadowing
		r, err := cldf_ops.ExecuteOperation(b, operation.UpdateOffRampSourceChainConfigsOp, dp, in.UpdateOffRampSourcesConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update offramp sources: %w", err)
		}

		contractType := bindings.PkgCCIP + ".OffRamp"
		addr := stateCCIP.OffRamp

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

	// add ccip owner to offramp allowlist

	// update fee quoter with gas prices
	{
		b.Logger.Infow("Updating prices on FeeQuoter", "input", in.UpdateFeeQuoterPricesConfig)
		//nolint:govet // allow shadowing
		r, err := cldf_ops.ExecuteOperation(b, operation.UpdateFeeQuoterPricesOp, dp, in.UpdateFeeQuoterPricesConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update feequoter prices: %w", err)
		}

		contractType := bindings.PkgCCIP + ".FeeQuoter"
		addr := stateCCIP.FeeQuoter

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

	// router with onramps and offramps
	{
		b.Logger.Infow("Updating Router onramps & offramps", "input", in.ApplyRampUpdatesConfig)
		//nolint:govet // allow shadowing
		r, err := cldf_ops.ExecuteOperation(b, operation.ApplyRampUpdatesOp, dp, in.ApplyRampUpdatesConfig)
		if err != nil {
			return sequences.OnChainOutput{}, fmt.Errorf("failed to update router onramps: %w", err)
		}

		contractType := bindings.PkgCCIP + ".Router"
		addr := stateCCIP.Router

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
}

// ToTonUpdateLanesConfig converts UpdateTonLanesConfig into Ton specific update inputs
func ToTonUpdateLanesConfig(tonChains map[uint64]tonstate.CCIPChainState, cfg ccipConfig.UpdateTonLanesConfig) map[uint64]UpdateTonLanesSeqInput {
	updateInputsByTonChain := make(map[uint64]UpdateTonLanesSeqInput)

	// Group the operations by Ton chain
	for _, lane := range cfg.Lanes {
		// Process lanes with Ton as the source chain
		if lane.Source.ChainFamily() == chainsel.FamilyTon {
			source := lane.Source
			if _, exists := updateInputsByTonChain[source.Selector]; !exists {
				updateInputsByTonChain[source.Selector] = UpdateTonLanesSeqInput{}
			}
			setTonSourceUpdates(lane, updateInputsByTonChain, cfg.TestRouter, tonChains[source.Selector])
		}

		// Process lanes with Ton as the destination chain
		if lane.Dest.ChainFamily() == chainsel.FamilyTon {
			dest := lane.Dest
			if _, exists := updateInputsByTonChain[dest.Selector]; !exists {
				updateInputsByTonChain[dest.Selector] = UpdateTonLanesSeqInput{}
			}
			offrampAddress := tonChains[dest.Selector].OffRamp
			setTonDestinationUpdates(lane, updateInputsByTonChain, cfg.TestRouter, &offrampAddress)
		}
	}

	return updateInputsByTonChain
}

func setTonSourceUpdates(lane ccipConfig.LaneConfig, updateInputsByTonChain map[uint64]UpdateTonLanesSeqInput, isTestRouter bool, state tonstate.CCIPChainState) {
	source := lane.Source
	dest := lane.Dest

	// Setting the destination on the on ramp
	input := updateInputsByTonChain[source.Selector]

	// isEnabled := !lane.IsDisabled
	// TODO (ops/ccip): !input.IsDisabled
	// TODO (ops/ccip): input.TestRouter // TODO: changesets use a flag rather than raw address?
	input.UpdateOnRampDestChainConfigs = []onramp.UpdateDestChainConfig{
		{
			DestinationChainSelector: dest.Selector,
			Router:                   &state.Router,
			AllowListEnabled:         dest.AllowListEnabled,
		},
	}

	// Setting gas prices updates
	if input.UpdateFeeQuoterPricesConfig.GasPrices == nil {
		input.UpdateFeeQuoterPricesConfig.GasPrices = make(map[uint64]operation.GasPrice)
	}
	input.UpdateFeeQuoterPricesConfig.GasPrices[dest.Selector] = operation.FromPackedGasFee(dest.GasPrice)

	// Setting token prices updates
	if input.UpdateFeeQuoterPricesConfig.TokenPrices == nil {
		input.UpdateFeeQuoterPricesConfig.TokenPrices = make(map[string]*big.Int)
	}
	maps.Copy(input.UpdateFeeQuoterPricesConfig.TokenPrices, source.TokenPrices)

	// Setting the fee quoter destination on the source chain
	input.UpdateFeeQuoterDestChainConfigs = append(input.UpdateFeeQuoterDestChainConfigs, feequoter.UpdateDestChainConfig{
		DestinationChainSelector: dest.Selector,
		DestChainConfig:          ccipConfig.TonFeeQuoterConfig(dest.FeeQuoterDestChainConfig),
	})

	// Setting Router OnRamp version updates
	// onRampVersion := dest.OnRampVersion
	// if onRampVersion == nil {
	// 	onRampVersion = defaultOnRampVersion
	// }

	// update the onramp address map with the destination selector
	if input.ApplyRampUpdatesConfig.OnRampUpdates == nil {
		input.ApplyRampUpdatesConfig.OnRampUpdates = make(operation.RampUpdates)
	}

	rampAddress := state.OnRamp.String()
	input.ApplyRampUpdatesConfig.OnRampUpdates[rampAddress] = append(
		input.ApplyRampUpdatesConfig.OnRampUpdates[rampAddress],
		router.ChainSelector{Value: dest.Selector},
	)

	updateInputsByTonChain[source.Selector] = input
}

func setTonDestinationUpdates(lane ccipConfig.LaneConfig, updateInputsByTonChain map[uint64]UpdateTonLanesSeqInput, isTestRouter bool, offrampAddress *address.Address) {
	source := lane.Source
	dest := lane.Dest
	isEnabled := !lane.IsDisabled

	// Setting off ramp updates
	input := updateInputsByTonChain[dest.Selector]

	if input.UpdateOffRampSourcesConfig.Updates == nil {
		input.UpdateOffRampSourcesConfig.Updates = make(map[uint64]operation.OffRampSourceUpdate)
	}

	input.UpdateOffRampSourcesConfig.Updates[source.Selector] = operation.OffRampSourceUpdate{
		IsEnabled:                 isEnabled,
		TestRouter:                isTestRouter,
		IsRMNVerificationDisabled: source.RMNVerificationDisabled,
		OnRamp:                    lane.OnRamp,
	}

	rampAddress := offrampAddress.String()
	input.ApplyRampUpdatesConfig = operation.ApplyRampUpdatesInput{
		OffRampAdds: operation.RampUpdates{
			rampAddress: []router.ChainSelector{
				{
					Value: source.Selector,
				},
			},
		},
		OffRampRemoves: nil,
	}

	updateInputsByTonChain[dest.Selector] = input
}

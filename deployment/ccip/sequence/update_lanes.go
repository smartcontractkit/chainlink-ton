package sequence

import (
	"fmt"
	"maps"
	"math/big"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	chainsel "github.com/smartcontractkit/chain-selectors"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tlbe"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"

	ccipConfig "github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	opston "github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	ton_fee_quoter "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
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

func updateLanes(b cldf_ops.Bundle, deps ccipConfig.CCIPDeps, in UpdateTonLanesSeqInput) ([]*tlbe.Cell[tlb.InternalMessage], error) {
	msgs := make([]*tlbe.Cell[tlb.InternalMessage], 0)

	// TODO (ops): improve deps passing
	opdeps := opston.SendMessagesDeps{
		Wallet: deps.TonChain.Wallet,
		Client: deps.TonChain.Client,
	}

	// update fee quoter with dest chain configs
	{
		updates := in.UpdateFeeQuoterDestChainConfigs
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
				return nil, fmt.Errorf("failed to exec send messages operation: %w", err)
			}

			msgs = append(msgs, opston.AsCells(r.Output.Plans)...)
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
				return nil, fmt.Errorf("failed to exec send messages operation: %w", err)
			}

			msgs = append(msgs, opston.AsCells(r.Output.Plans)...)
		}
	}

	// configure offramp sources
	b.Logger.Infow("Updating source configs on OffRamp", "input", in.UpdateOffRampSourcesConfig)
	offRampReport, err := cldf_ops.ExecuteOperation(b, operation.UpdateOffRampSourceChainConfigsOp, deps, in.UpdateOffRampSourcesConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to update offramp sources: %w", err)
	}
	msgs = append(msgs, offRampReport.Output...)

	// add ccip owner to offramp allowlist

	// update fee quoter with gas prices
	b.Logger.Infow("Updating prices on FeeQuoter", "input", in.UpdateFeeQuoterPricesConfig)
	updatePricesReport, err := cldf_ops.ExecuteOperation(b, operation.UpdateFeeQuoterPricesOp, deps, in.UpdateFeeQuoterPricesConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to update feequoter prices: %w", err)
	}
	msgs = append(msgs, updatePricesReport.Output...)

	// router with onramps and offramps
	b.Logger.Infow("Updating Router onramps & offramps", "input", in.ApplyRampUpdatesConfig)
	routerApplyRampUpdatesReport, err := cldf_ops.ExecuteOperation(b, operation.ApplyRampUpdatesOp, deps, in.ApplyRampUpdatesConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to update router onramps: %w", err)
	}
	msgs = append(msgs, routerApplyRampUpdatesReport.Output...)

	return msgs, nil
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
	input.UpdateFeeQuoterDestChainConfigs = append(input.UpdateFeeQuoterDestChainConfigs, ton_fee_quoter.UpdateDestChainConfig{
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

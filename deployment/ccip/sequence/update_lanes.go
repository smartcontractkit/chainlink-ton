package sequence

import (
	"fmt"
	"maps"
	"math/big"

	"github.com/Masterminds/semver/v3"
	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"

	tonstate "github.com/smartcontractkit/chainlink-ton/deployment/state"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
	ton_fee_quoter "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
)

type UpdateTonLanesSeqInput struct {
	UpdateFeeQuoterDestChainConfigs operation.UpdateFeeQuoterDestChainConfigsInput
	UpdateFeeQuoterPricesConfig     operation.UpdateFeeQuoterPricesInput
	UpdateOnRampDestChainConfigs    operation.UpdateOnRampDestChainConfigsInput
	UpdateOffRampSourcesConfig      operation.UpdateOffRampSourcesInput
	UpdateRouterDestConfig          operation.UpdateRouterDestInput
}

var UpdateTonLanesSequence = operations.NewSequence(
	"ton-update-lanes-seq",
	semver.MustParse("0.1.0"),
	"Configures a lane",
	updateLanes,
)

func updateLanes(b operations.Bundle, deps operation.TonDeps, in UpdateTonLanesSeqInput) ([][]byte, error) {
	var txs [][]byte

	// update fee quoter with dest chain configs
	b.Logger.Infow("Updating destination configs on FeeQuoter", "input", in.UpdateFeeQuoterDestChainConfigs)
	feeQuoterReport, err := operations.ExecuteOperation(b, operation.UpdateFeeQuoterDestChainConfigsOp, deps, in.UpdateFeeQuoterDestChainConfigs)
	if err != nil {
		return nil, fmt.Errorf("failed to update feequoter destinations: %w", err)
	}
	txs = append(txs, feeQuoterReport.Output...)

	// update onramp with dest chain configs
	b.Logger.Infow("Updating destination configs on OnRamp", "input", in.UpdateOnRampDestChainConfigs)
	onRampReport, err := operations.ExecuteOperation(b, operation.UpdateOnRampDestChainConfigsOp, deps, in.UpdateOnRampDestChainConfigs)
	if err != nil {
		return nil, fmt.Errorf("failed to update onramp destinations: %w", err)
	}
	txs = append(txs, onRampReport.Output...)

	// configure offramp sources
	b.Logger.Infow("Updating source configs on OffRamp", "input", in.UpdateOffRampSourcesConfig)
	offRampReport, err := operations.ExecuteOperation(b, operation.UpdateOffRampSourceChainConfigsOp, deps, in.UpdateOffRampSourcesConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to update offramp sources: %w", err)
	}
	txs = append(txs, offRampReport.Output...)

	// add ccip owner to offramp allowlist

	// update fee quoter with gas prices
	b.Logger.Infow("Updating prices on FeeQuoter", "input", in.UpdateFeeQuoterPricesConfig)
	updatePricesReport, err := operations.ExecuteOperation(b, operation.UpdateFeeQuoterPricesOp, deps, in.UpdateFeeQuoterPricesConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to update feequoter prices: %w", err)
	}
	txs = append(txs, updatePricesReport.Output...)

	// update router with destination onramp versions
	b.Logger.Infow("Updating Router", "input", in.UpdateRouterDestConfig)
	routerReport, err := operations.ExecuteOperation(b, operation.UpdateRouterDestOp, deps, in.UpdateRouterDestConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to update router: %w", err)
	}
	txs = append(txs, routerReport.Output...)

	return txs, nil
}

// ToTonUpdateLanesConfig converts UpdateTonLanesConfig into Ton specific update inputs
func ToTonUpdateLanesConfig(tonChains map[uint64]tonstate.CCIPChainState, cfg config.UpdateTonLanesConfig) map[uint64]UpdateTonLanesSeqInput {
	updateInputsByTonChain := make(map[uint64]UpdateTonLanesSeqInput)

	// Group the operations by Ton chain
	for _, lane := range cfg.Lanes {
		// Process lanes with Ton as the source chain
		if lane.Source.ChainFamily() == chainsel.FamilyTon {
			source := lane.Source
			if _, exists := updateInputsByTonChain[source.Selector]; !exists {
				updateInputsByTonChain[source.Selector] = UpdateTonLanesSeqInput{}
			}
			onrampAddress := tonChains[source.Selector].OnRamp
			setTonSourceUpdates(lane, updateInputsByTonChain, cfg.TestRouter, &onrampAddress)
		}

		// Process lanes with Ton as the destination chain
		if lane.Dest.ChainFamily() == chainsel.FamilyTon {
			dest := lane.Dest
			if _, exists := updateInputsByTonChain[dest.Selector]; !exists {
				updateInputsByTonChain[dest.Selector] = UpdateTonLanesSeqInput{}
			}
			setTonDestinationUpdates(lane, updateInputsByTonChain, cfg.TestRouter)
		}
	}

	return updateInputsByTonChain
}

func setTonSourceUpdates(lane config.LaneConfig, updateInputsByTonChain map[uint64]UpdateTonLanesSeqInput, isTestRouter bool, onrampAddress *address.Address) {
	source := lane.Source
	dest := lane.Dest
	isEnabled := !lane.IsDisabled

	// Setting the destination on the on ramp
	input := updateInputsByTonChain[source.Selector]

	if input.UpdateOnRampDestChainConfigs.Updates == nil {
		input.UpdateOnRampDestChainConfigs.Updates = make(map[uint64]operation.OnRampDestinationUpdate)
	}
	input.UpdateOnRampDestChainConfigs.Updates[dest.Selector] = operation.OnRampDestinationUpdate{
		IsEnabled:        isEnabled,
		TestRouter:       isTestRouter, // TODO: changesets use a flag rather than raw address?
		AllowListEnabled: dest.AllowListEnabled,
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
		DestChainConfig:          config.TonFeeQuoterConfig(dest.FeeQuoterDestChainConfig),
	})

	// Setting Router OnRamp version updates
	// onRampVersion := dest.OnRampVersion
	// if onRampVersion == nil {
	// 	onRampVersion = defaultOnRampVersion
	// }
	input.UpdateRouterDestConfig = operation.UpdateRouterDestInput{
		DestChainSelector: dest.Selector,
		OnRamp:            onrampAddress,
	}

	updateInputsByTonChain[source.Selector] = input
}

func setTonDestinationUpdates(lane config.LaneConfig, updateInputsByTonChain map[uint64]UpdateTonLanesSeqInput, isTestRouter bool) {
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
	}

	updateInputsByTonChain[dest.Selector] = input
}

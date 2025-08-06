package sequence

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	chainsel "github.com/smartcontractkit/chain-selectors"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	tonstate "github.com/smartcontractkit/chainlink/deployment/ccip/shared/stateview/ton"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/ops/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/operation"
	ton_fee_quoter "github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
)

type UpdateTonLanesSeqInput struct {
	UpdateFeeQuoterDestChainConfigs operation.UpdateFeeQuoterDestChainConfigsInput
	// UpdateFeeQuoterPricesConfig operation.UpdateFeeQuoterPricesInput
	UpdateOnRampDestChainConfigs operation.UpdateOnRampDestChainConfigsInput
	// UpdateOffRampSourcesConfig  operation.UpdateOffRampSourcesInput
	UpdateRouterDestConfig operation.UpdateRouterDestInput
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
	b.Logger.Info("Updating destination configs on FeeQuoter")
	feeQuoterReport, err := operations.ExecuteOperation(b, operation.UpdateFeeQuoterDestChainConfigsOp, deps, in.UpdateFeeQuoterDestChainConfigs)
	if err != nil {
		return nil, fmt.Errorf("failed to update onramp destinations: %w", err)
	}
	txs = append(txs, feeQuoterReport.Output...)

	// update onramp with dest chain configs
	b.Logger.Info("Updating destination configs on OnRamp")
	onRampReport, err := operations.ExecuteOperation(b, operation.UpdateOnRampDestChainConfigsOp, deps, in.UpdateOnRampDestChainConfigs)
	if err != nil {
		return nil, fmt.Errorf("failed to update onramp destinations: %w", err)
	}
	txs = append(txs, onRampReport.Output...)

	// configure offramp sources

	// add ccip owner to offramp allowlist

	// update fee quoter with gas prices

	// update router with destination onramp versions
	b.Logger.Info("Updating Router")
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
		if lane.Source.GetChainFamily() == chainsel.FamilyTon {
			source := lane.Source.(config.TonChainDefinition)
			if _, exists := updateInputsByTonChain[source.Selector]; !exists {
				updateInputsByTonChain[source.Selector] = UpdateTonLanesSeqInput{}
			}
			onrampAddress := tonChains[source.Selector].OnRamp
			setTonSourceUpdates(lane, updateInputsByTonChain, cfg.TestRouter, &onrampAddress)
		}

		// Process lanes with Ton as the destination chain
		if lane.Dest.GetChainFamily() == chainsel.FamilyTon {
			dest := lane.Dest.(config.TonChainDefinition)
			if _, exists := updateInputsByTonChain[dest.Selector]; !exists {
				updateInputsByTonChain[dest.Selector] = UpdateTonLanesSeqInput{}
			}
			setTonDestinationUpdates(lane, updateInputsByTonChain, cfg.TestRouter)
		}
	}

	return updateInputsByTonChain
}

func setTonSourceUpdates(lane config.LaneConfig, updateInputsByTonChain map[uint64]UpdateTonLanesSeqInput, isTestRouter bool, onrampAddress *address.Address) {
	source := lane.Source.(config.TonChainDefinition)
	dest := lane.Dest.(config.EVMChainDefinition)
	isEnabled := !lane.IsDisabled

	// Setting the destination on the on ramp
	input := updateInputsByTonChain[source.Selector]

	if input.UpdateOnRampDestChainConfigs.Updates == nil {
		input.UpdateOnRampDestChainConfigs.Updates = make(map[uint64]v1_6.OnRampDestinationUpdate)
	}
	input.UpdateOnRampDestChainConfigs.Updates[dest.Selector] = v1_6.OnRampDestinationUpdate{
		IsEnabled:        isEnabled,
		TestRouter:       isTestRouter, // TODO: changesets use a flag rather than raw address?
		AllowListEnabled: dest.AllowListEnabled,
	}

	// Setting gas prices updates
	// if input.UpdateFeeQuoterPricesConfig.GasPrices == nil {
	// 	input.UpdateFeeQuoterPricesConfig.GasPrices = make(map[uint64]*big.Int)
	// }
	// input.UpdateFeeQuoterPricesConfig.GasPrices[dest.Selector] = dest.GasPrice

	// Setting token prices updates
	// if input.UpdateFeeQuoterPricesConfig.TokenPrices == nil {
	// 	input.UpdateFeeQuoterPricesConfig.TokenPrices = make(map[string]*big.Int)
	// }
	// for tokenAddr, price := range source.TokenPrices {
	// 	input.UpdateFeeQuoterPricesConfig.TokenPrices[tokenAddr.StringLong()] = price
	// }

	// Setting the fee quoter destination on the source chain
	input.UpdateFeeQuoterDestChainConfigs = append(input.UpdateFeeQuoterDestChainConfigs, ton_fee_quoter.UpdateDestChainConfig{
		DestinationChainSelector: dest.Selector,
		DestChainConfig:          dest.GetConvertedTonFeeQuoterConfig(),
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
	// source := lane.Source.(config.EVMChainDefinition)
	// dest := lane.Dest.(config.TonChainDefinition)
	// isEnabled := !lane.IsDisabled
	//
	// // Setting off ramp updates
	// input := updateInputsByTonChain[dest.Selector]
	//
	//	if input.UpdateOffRampSourcesConfig.Updates == nil {
	//		input.UpdateOffRampSourcesConfig.Updates = make(map[uint64]v1_6.OffRampSourceUpdate)
	//	}
	//
	//	input.UpdateOffRampSourcesConfig.Updates[source.Selector] = v1_6.OffRampSourceUpdate{
	//		IsEnabled:                 isEnabled,
	//		TestRouter:                isTestRouter,
	//		IsRMNVerificationDisabled: source.RMNVerificationDisabled,
	//	}
	//
	// updateInputsByTonChain[dest.Selector] = input
}

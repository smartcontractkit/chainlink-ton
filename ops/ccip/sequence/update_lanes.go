package sequence

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/operation"
	"github.com/xssnick/tonutils-go/tlb"
)

type UpdateTonLanesSeqInput struct {
	// UpdateFeeQuoterDestsConfig  operation.UpdateFeeQuoterDestsInput
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

func updateLanes(b operations.Bundle, deps operation.TonDeps, in UpdateTonLanesSeqInput) ([]*tlb.InternalMessage, error) {
	var txs []*tlb.InternalMessage

	// update fee quoter with dest chain configs

	// update onramp with dest chain configs
	b.Logger.Info("Updating destination configs on OnRamps")
	onRampReport, err := operations.ExecuteOperation(b, operation.UpdateOnRampDestChainConfigsOp, deps, in.UpdateOnRampDestChainConfigs)
	if err != nil {
		return nil, fmt.Errorf("failed to update onramp destinations: %w", err)
	}
	txs = append(txs, onRampReport.Output...)

	// configure offramp sources

	// add ccip owner to offramp allowlist

	// update fee quoter with gas prices

	// update router with destination onramp versions
	b.Logger.Info("Updating router")
	routerReport, err := operations.ExecuteOperation(b, operation.UpdateRouterDestOp, deps, in.UpdateRouterDestConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to update router: %w", err)
	}
	txs = append(txs, routerReport.Output...)

	return txs, nil
}

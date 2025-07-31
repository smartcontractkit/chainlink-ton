package sequence

import (
	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/ops/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/operation"
)

type DeployCCIPSeqInput struct {
	CCIPConfig config.ChainContractParams
}

type DeployCCIPSeqOutput struct {
	RouterAddress    *address.Address
	FeeQuoterAddress *address.Address
	OnRampAddress    *address.Address
	OffRampAddress   *address.Address
}

var DeployCCIPSequence = operations.NewSequence(
	"ton-deploy-ccip-seq",
	semver.MustParse("0.1.0"),
	"Deploys contracts and sets initial CCIP configuration",
	deployCCIPSequence,
)

// TODO: make idempotent by only deploying if address not yet set?
func deployCCIPSequence(b operations.Bundle, deps operation.TonDeps, in DeployCCIPSeqInput) (DeployCCIPSeqOutput, error) {
	// Initialize the output
	output := DeployCCIPSeqOutput{}

	routerInput := operation.DeployRouterInput{
		// chainSelector ?
	}
	deployRouterReport, err := operations.ExecuteOperation(b, operation.DeployRouterOp, deps, routerInput)
	if err != nil {
		return output, err
	}
	output.RouterAddress = deployRouterReport.Output.Address

	feeQuoterInput := operation.DeployFeeQuoterInput{
		Params:   in.CCIPConfig.FeeQuoterParams,
		LinkAddr: address.NewAddressNone(),
	}
	deployFeeQuoterReport, err := operations.ExecuteOperation(b, operation.DeployFeeQuoterOp, deps, feeQuoterInput)
	if err != nil {
		return output, err
	}
	output.FeeQuoterAddress = deployFeeQuoterReport.Output.Address

	onrampInput := operation.DeployOnRampInput{
		ChainSelector: in.CCIPConfig.OnRampParams.ChainSelector,
		FeeQuoter:     deployFeeQuoterReport.Output.Address,
		FeeAggregator: in.CCIPConfig.OnRampParams.FeeAggregator,
	}

	deployOnRampReport, err := operations.ExecuteOperation(b, operation.DeployOnRampOp, deps, onrampInput)
	if err != nil {
		return output, err
	}
	output.OnRampAddress = deployOnRampReport.Output.Address

	return output, nil
}

package sequence

import (
	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/operation"
	"github.com/xssnick/tonutils-go/address"
)

type DeployCCIPSeqInput struct {
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
	"Deploys and sets initial CCIP router configuration",
	deployCCIPSequence,
)

func deployCCIPSequence(b operations.Bundle, deps operation.TonDeps, in DeployCCIPSeqInput) (DeployCCIPSeqOutput, error) {
	// Initialize the output
	output := DeployCCIPSeqOutput{}

	deployRouterReport, err := operations.ExecuteOperation(b, operation.DeployRouterOp, deps, in)
	if err != nil {
		return output, err
	}
	output.RouterAddress = deployRouterReport.Output.Address

	deployOnRampReport, err := operations.ExecuteOperation(b, operation.DeployOnRampOp, deps, in)
	if err != nil {
		return output, err
	}
	output.OnRampAddress = deployOnRampReport.Output.Address

	// state := deps.CCIPOnChainState.TonChains[deps.TonChain.Selector]
	// state.CCIPAddress = *output.CCIPAddress
	// TEMP: workaround:
	// deps.CCIPOnChainState.TonChains[deps.TonChain.Selector] = state
	// TODO: how to do this properly? we'd need to execute on the changeset level
	// err = tonstate.SaveOnchainState(selector, state, env)
	// if err != nil {
	// 	return cldf.ChangesetOutput{}, err
	// }

	return output, nil
}

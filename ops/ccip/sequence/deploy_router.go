package sequence

import (
	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/operation"
)

var DeployAndInitCCIPRouterSequence = operations.NewSequence(
	"ton-deploy-ccip-router-seq",
	semver.MustParse("0.1.0"),
	"Deploys and sets initial CCIP router configuration",
	deployCCIPRouterSequence,
)

func deployCCIPRouterSequence(b operations.Bundle, deps operation.TonDeps, in operation.DeployCCIPRouterInput) (operation.DeployCCIPRouterOutput, error) {
	// Initialize the output
	output := operation.DeployCCIPRouterOutput{}

	// Execute the deployment operation
	out, err := operations.ExecuteOperation(b, operation.DeployRouterOp, deps, in)
	if err != nil {
		return output, err
	}

	output.CCIPAddress = out.Output.CCIPAddress
	return output, nil
}

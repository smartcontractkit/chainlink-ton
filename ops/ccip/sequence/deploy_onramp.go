package sequence

import (
	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/operation"
)

var DeployAndInitCCIPOnRampSequence = operations.NewSequence(
	"ton-deploy-ccip-onramp-seq",
	semver.MustParse("0.1.0"),
	"Deploys and sets initial CCIP onRamp configuration",
	deployCCIPOnrampSequence,
)

func deployCCIPOnrampSequence(b operations.Bundle, deps operation.TonDeps, in operation.DeployCCIPOnrampInput) (operation.DeployCCIPOnrampOutput, error) {
	// Initialize the output
	output := operation.DeployCCIPOnrampOutput{}

	// Execute the deployment operation
	out, err := operations.ExecuteOperation(b, operation.DeployOnRampOp, deps, in)
	if err != nil {
		return output, err
	}

	output.CCIPAddress = out.Output.CCIPAddress
	return output, nil
}

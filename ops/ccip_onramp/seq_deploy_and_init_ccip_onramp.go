package ccip_onramp

import (
	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops"
	"github.com/xssnick/tonutils-go/address"
)

type DeployCCIPOnrampInput struct{}

type DeployCCIPOnrampSeqOutput struct {
	CCIPAddress *address.Address
}

var DeployAndInitCCIPOnRampSequence = operations.NewSequence(
	"ton-deploy-ccip-onramp-seq",
	semver.MustParse("0.1.0"),
	"Deploys and sets initial CCIP onRamp configuration",
	deployCCIPSequence,
)

func deployCCIPSequence(b operations.Bundle, deps ops.TonDeps, in ops.OpTxInput[DeployCCIPOnrampInput]) (ops.OpTxResult[DeployCCIPOnrampSeqOutput], error) {
	// Initialize the output
	output := ops.OpTxResult[DeployCCIPOnrampSeqOutput]{}

	// Execute the deployment operation
	out, err := operations.ExecuteOperation(b, DeployOnRampOp, deps, in)
	if err != nil {
		return output, err
	}

	output.Objects.CCIPAddress = out.Output.Objects.CCIPAddress
	return output, nil
}

package ccip_router

import (
	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops"
	"github.com/xssnick/tonutils-go/address"
)

type DeployCCIPRouterInput struct{}

type DeployCCIPRouterSeqOutput struct {
	CCIPAddress *address.Address
}

var DeployAndInitCCIPRouterSequence = operations.NewSequence(
	"ton-deploy-ccip-router-seq",
	semver.MustParse("0.1.0"),
	"Deploys and sets initial CCIP router configuration",
	deployCCIPSequence,
)

func deployCCIPSequence(b operations.Bundle, deps ops.TonDeps, in ops.OpTxInput[DeployCCIPRouterInput]) (ops.OpTxResult[DeployCCIPRouterSeqOutput], error) {
	// Initialize the output
	output := ops.OpTxResult[DeployCCIPRouterSeqOutput]{}

	// Execute the deployment operation
	out, err := operations.ExecuteOperation(b, DeployOnRampOp, deps, in)
	if err != nil {
		return output, err
	}

	output.Objects.CCIPAddress = out.Output.Objects.CCIPAddress
	return output, nil
}

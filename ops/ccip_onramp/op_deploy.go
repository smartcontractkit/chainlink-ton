package ccip_onramp

import (
	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops"
)

var DeployOnRampOp = operations.NewOperation(
	"deploy-onramp-op",
	semver.MustParse("0.1.0"),
	"Generates MCMS proposals that deploys OnRamp module on CCIP package",
	deployOnRamp,
)

func deployOnRamp(b operations.Bundle, deps ops.TonDeps, in ops.OpTxInput[DeployCCIPOnrampInput]) (ops.OpTxResult[DeployCCIPOnrampSeqOutput], error) {
	output := ops.OpTxResult[DeployCCIPOnrampSeqOutput]{}
	// TODO : Implement the deployment logic for the OnRamp contracts

	return output, nil
}

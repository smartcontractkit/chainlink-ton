package ccip_router

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	test_utils "github.com/smartcontractkit/chainlink-ton/integration-tests/utils"
	"github.com/smartcontractkit/chainlink-ton/ops"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

var DeployOnRampOp = operations.NewOperation(
	"deploy-onramp-op",
	semver.MustParse("0.1.0"),
	"Generates MCMS proposals that deploys Router module on CCIP package",
	deployRouter,
)

func deployRouter(b operations.Bundle, deps ops.TonDeps, in ops.OpTxInput[DeployCCIPRouterInput]) (ops.OpTxResult[DeployCCIPRouterSeqOutput], error) {
	output := ops.OpTxResult[DeployCCIPRouterSeqOutput]{}

	// TODO wrap the code cell creation somewhere
	CounterContractPath := test_utils.GetBuildDir("Router.compiled.json")
	codeCell, err := wrappers.ParseCompiledContract(CounterContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	// TODO replace with the actuall cell using router gobinding
	contract, err := wrappers.Deploy(&conn, codeCell, cell.BeginCell().EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return output, fmt.Errorf("failed to deploy router contract: %w", err)
	}

	output.Objects.CCIPAddress = contract.Address
	return output, nil
}

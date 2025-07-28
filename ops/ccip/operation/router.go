package operation

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	test_utils "github.com/smartcontractkit/chainlink-ton/integration-tests/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type DeployRouterInput struct{}

type DeployRouterOutput struct {
	Address *address.Address
}

var DeployRouterOp = operations.NewOperation(
	"deploy-router-op",
	semver.MustParse("0.1.0"),
	"Generates MCMS proposals that deploys Router module on CCIP package",
	deployRouter,
)

func deployRouter(b operations.Bundle, deps TonDeps, in DeployRouterInput) (DeployRouterOutput, error) {
	output := DeployRouterOutput{}

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

	output.Address = contract.Address
	return output, nil
}

type UpdateRouterDestInput struct{}

type UpdateRouterDestOutput struct {
}

var UpdateRouterDestOp = operations.NewOperation(
	"update-router-dest-op",
	semver.MustParse("0.1.0"),
	"Generates MCMS proposals that deploys Router module on CCIP package",
	updateRouterDest,
)

func updateRouterDest(b operations.Bundle, deps TonDeps, in UpdateRouterDestInput) ([]*tlb.InternalMessage, error) {
	return nil, nil
}

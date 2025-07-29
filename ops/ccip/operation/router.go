package operation

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	test_utils "github.com/smartcontractkit/chainlink-ton/integration-tests/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
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

	storage := router.Storage{
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		OnRamp: nil, // set afterwards
	}
	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	contract, err := wrappers.Deploy(&conn, codeCell, initData, tlb.MustFromTON("1"))
	if err != nil {
		return output, fmt.Errorf("failed to deploy router contract: %w", err)
	}

	output.Address = contract.Address
	return output, nil
}

type UpdateRouterDestInput struct {
	DestChainSelector uint64
	OnRamp            *address.Address
}

type UpdateRouterDestOutput struct {
}

var UpdateRouterDestOp = operations.NewOperation(
	"update-router-dest-op",
	semver.MustParse("0.1.0"),
	"Generates MCMS proposals that deploys Router module on CCIP package",
	updateRouterDest,
)

func updateRouterDest(b operations.Bundle, deps TonDeps, in UpdateRouterDestInput) ([]*tlb.InternalMessage, error) {
	address := deps.CCIPOnChainState.TonChains[deps.TonChain.Selector].Router

	input := router.SetRamp{
		DestChainSelector: in.DestChainSelector,
		OnRamp:            in.OnRamp,
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize router input: %w", err)
	}

	msg := []*tlb.InternalMessage{
		{
			Bounce:  true,
			DstAddr: &address,
			Body:    payload,
		},
	}
	return msg, nil
}

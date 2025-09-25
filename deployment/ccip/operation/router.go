package operation

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/router"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployRouterInput struct {
	ContractPath string
}

type DeployRouterOutput struct {
	Address *address.Address
}

var DeployRouterOp = operations.NewOperation(
	"deploy-router-op",
	semver.MustParse("0.1.0"),
	"Deploys the Router contract",
	deployRouter,
)

func deployRouter(b operations.Bundle, deps TonDeps, in DeployRouterInput) (DeployRouterOutput, error) {
	output := DeployRouterOutput{}

	// TODO wrap the code cell creation somewhere
	codeCell, err := wrappers.ParseCompiledContract(in.ContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	storage := router.Storage{
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		OnRamps: nil, // set afterwards
		KeyLen:  64,
	}
	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	contract, _, err := wrappers.Deploy(&conn, codeCell, initData, tlb.MustFromTON("1"), nil)
	if err != nil {
		return output, fmt.Errorf("failed to deploy router contract: %w", err)
	}
	b.Logger.Infow("Deployed Router", "addr", contract.Address, "deployer wallet addr", deps.TonChain.WalletAddress.String())

	output.Address = contract.Address
	return output, nil
}

type UpdateRouterDestInput map[string][]router.DestChainSelector

type UpdateRouterDestOutput struct {
}

var UpdateRouterDestOp = operations.NewOperation(
	"update-router-dest-op",
	semver.MustParse("0.1.0"),
	"Generates MCMS proposals that deploys Router module on CCIP package",
	updateRouterDest,
)

func updateRouterDest(b operations.Bundle, deps TonDeps, in UpdateRouterDestInput) ([][]byte, error) {
	addr := deps.CCIPOnChainState[deps.TonChain.Selector].Router

	msgs := make([]*tlb.InternalMessage, 0)
	for onRampAddrStr, selectors := range in {
		rampAddr := address.MustParseAddr(onRampAddrStr)
		input := router.SetRamps{
			DestChainSelectors: selectors,
			OnRamps:            rampAddr,
		}

		payload, err := tlb.ToCell(input)
		if err != nil {
			return nil, fmt.Errorf("failed to serialize router input: %w", err)
		}

		msg := tlb.InternalMessage{
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &addr,
			Body:    payload,
		}
		msgs = append(msgs, &msg)
	}

	return utils.Serialize(msgs)
}

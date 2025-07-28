package operation

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	test_utils "github.com/smartcontractkit/chainlink-ton/integration-tests/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type DeployFeeQuoterInput struct{}

type DeployFeeQuoterOutput struct {
	CCIPAddress *address.Address
}

var DeployFeeQuoterOp = operations.NewOperation(
	"deploy-fee-quoter-op",
	semver.MustParse("0.1.0"),
	"Generates MCMS proposals that deploys FeeQuoter module on CCIP package",
	deployFeeQuoter,
)

func deployFeeQuoter(b operations.Bundle, deps TonDeps, in DeployFeeQuoterInput) (DeployFeeQuoterOutput, error) {
	output := DeployFeeQuoterOutput{}

	// TODO wrap the code cell creation somewhere
	CounterContractPath := test_utils.GetBuildDir("FeeQuoter.compiled.json")
	codeCell, err := wrappers.ParseCompiledContract(CounterContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	// TODO replace with the actuall cell using fee quoter gobinding https://github.com/smartcontractkit/chainlink-ton/pull/68
	contract, err := wrappers.Deploy(&conn, codeCell, cell.BeginCell().EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return output, fmt.Errorf("failed to deploy fee quoter contract: %w", err)
	}

	output.CCIPAddress = contract.Address
	return output, nil
}

type UpdateFeeQuoterDestChainConfigsInput []feequoter.UpdateDestChainConfig

type UpdateFeeQuoterDestChainConfigsOutput struct {
}

var UpdateFeeQuoterDestChainConfigsOp = operations.NewOperation(
	"update-dest-chain-configs",
	semver.MustParse("0.1.0"),
	"Updates fee quoter's destination chain configs",
	updateFeeQuoterDestChainConfigs,
)

func updateFeeQuoterDestChainConfigs(b operations.Bundle, deps TonDeps, in UpdateFeeQuoterDestChainConfigsInput) ([]*tlb.InternalMessage, error) {
	address := deps.CCIPOnChainState.TonChains[deps.TonChain.Selector].CCIPAddress

	input := feequoter.UpdateDestChainConfigs{
		Updates: common.SnakeData[feequoter.UpdateDestChainConfig](in),
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}

	messages := []*tlb.InternalMessage{
		{
			Bounce: true,
			// Amount:      amount,
			// TODO: need to add more addresses to deployments state, CCIPAddress should be FeeQuoter
			DstAddr: &address,
			Body:    payload,
		},
	}
	return messages, nil
}

// result = await fee-quoter.sendUpdateDestChainConfigs(deployer.getSender(), {
//   value: toNano('1'),
//   destChainConfigs: [
//     {
//       destChainSelector: CHAINSEL_EVM_TEST_90000001,
//       router: Buffer.alloc(64),
//       allowlistEnabled: false,
//     },
//   ],
// })

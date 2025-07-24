package operation

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	test_utils "github.com/smartcontractkit/chainlink-ton/integration-tests/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type DeployCCIPOnrampInput struct{}

type DeployCCIPOnrampOutput struct {
	CCIPAddress *address.Address
}

var DeployOnRampOp = operations.NewOperation(
	"deploy-onramp-op",
	semver.MustParse("0.1.0"),
	"Generates MCMS proposals that deploys OnRamp module on CCIP package",
	deployOnRamp,
)

func deployOnRamp(b operations.Bundle, deps TonDeps, in DeployCCIPOnrampInput) (DeployCCIPOnrampOutput, error) {
	output := DeployCCIPOnrampOutput{}

	// TODO wrap the code cell creation somewhere
	CounterContractPath := test_utils.GetBuildDir("OnRamp.compiled.json")
	codeCell, err := wrappers.ParseCompiledContract(CounterContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	// TODO replace with the actuall cell using onramp gobinding https://github.com/smartcontractkit/chainlink-ton/pull/68
	contract, err := wrappers.Deploy(&conn, codeCell, cell.BeginCell().EndCell(), tlb.MustFromTON("1"))
	if err != nil {
		return output, fmt.Errorf("failed to deploy onramp contract: %w", err)
	}

	output.CCIPAddress = contract.Address
	return output, nil
}

type UpdateDestChainConfigsInput []onramp.UpdateDestChainConfig

type UpdateDestChainConfigsOutput struct {
}

var UpdateDestChainConfigsOp = operations.NewOperation(
	"update-dest-chain-configs",
	semver.MustParse("0.1.0"),
	"Updates onramp's destination chain configs",
	updateDestChainConfigs,
)

func updateDestChainConfigs(b operations.Bundle, deps TonDeps, in UpdateDestChainConfigsInput) (UpdateDestChainConfigsOutput, error) {
	output := UpdateDestChainConfigsOutput{}

	input := onramp.UpdateDestChainConfigs{
		Updates: common.SnakeData[onramp.UpdateDestChainConfig](in),
	}

	// conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	// TODO replace with the actuall cell using onramp gobinding https://github.com/smartcontractkit/chainlink-ton/pull/68
	// contract, err := wrappers.Deploy(&conn, codeCell, cell.BeginCell().EndCell(), tlb.MustFromTON("1"))
	// if err != nil {
	// 	return output, fmt.Errorf("failed to deploy onramp contract: %w", err)
	// }

	// output.Objects.CCIPAddress = contract.Address
	return output, nil
}

// result = await onRamp.sendUpdateDestChainConfigs(deployer.getSender(), {
//   value: toNano('1'),
//   destChainConfigs: [
//     {
//       destChainSelector: CHAINSEL_EVM_TEST_90000001,
//       router: Buffer.alloc(64),
//       allowlistEnabled: false,
//     },
//   ],
// })

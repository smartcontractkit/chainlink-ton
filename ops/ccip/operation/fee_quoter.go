package operation

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/ops/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployFeeQuoterInput struct {
	Params   config.FeeQuoterParams
	LinkAddr *address.Address
}

type DeployFeeQuoterOutput struct {
	Address *address.Address
}

var DeployFeeQuoterOp = operations.NewOperation(
	"deploy-fee-quoter-op",
	semver.MustParse("0.1.0"),
	"Deploys the FeeQuoter contract",
	deployFeeQuoter,
)

func deployFeeQuoter(b operations.Bundle, deps TonDeps, in DeployFeeQuoterInput) (DeployFeeQuoterOutput, error) {
	output := DeployFeeQuoterOutput{}

	// TODO wrap the code cell creation somewhere
	CounterContractPath := utils.GetBuildDir("FeeQuoter.compiled.json")
	codeCell, err := wrappers.ParseCompiledContract(CounterContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	storage := feequoter.Storage{
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		MaxFeeJuelsPerMsg:            in.Params.MaxFeeJuelsPerMsg,
		LinkToken:                    in.LinkAddr,
		TokenPriceStalenessThreshold: in.Params.TokenPriceStalenessThreshold,
	}
	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	// TODO: handle setting FeeTokens and PremiumMultiplierWeiPerEthByFeeToken

	contract, err := wrappers.Deploy(&conn, codeCell, initData, tlb.MustFromTON("1"))
	if err != nil {
		return output, fmt.Errorf("failed to deploy fee quoter contract: %w", err)
	}

	output.Address = contract.Address
	return output, nil
}

type UpdateFeeQuoterDestChainConfigsInput []feequoter.UpdateDestChainConfig

type UpdateFeeQuoterDestChainConfigsOutput struct {
}

var UpdateFeeQuoterDestChainConfigsOp = operations.NewOperation(
	"update-fee-quoter-dest-chain-configs",
	semver.MustParse("0.1.0"),
	"Updates fee quoter's destination chain configs",
	updateFeeQuoterDestChainConfigs,
)

func updateFeeQuoterDestChainConfigs(b operations.Bundle, deps TonDeps, in UpdateFeeQuoterDestChainConfigsInput) ([][]byte, error) {
	address := deps.CCIPOnChainState.TonChains[deps.TonChain.Selector].CCIPAddress

	input := feequoter.UpdateDestChainConfigs{
		Update: in[0], // TEMP: until contracts get updated
		// Updates: common.SnakeData[feequoter.UpdateDestChainConfig](in),
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
	return utils.Serialize(messages)
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

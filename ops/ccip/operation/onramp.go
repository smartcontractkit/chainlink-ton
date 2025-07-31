package operation

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/smartcontractkit/chainlink-ton/ops/ccip/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
	"github.com/smartcontractkit/chainlink/deployment/ccip/changeset/v1_6"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
)

type DeployOnRampInput struct {
	ChainSelector uint64
	FeeQuoter     *address.Address
	FeeAggregator *address.Address
}

type DeployOnRampOutput struct {
	Address *address.Address
}

var DeployOnRampOp = operations.NewOperation(
	"deploy-onramp-op",
	semver.MustParse("0.1.0"),
	"Deploys the OnRamp contract",
	deployOnRamp,
)

func deployOnRamp(b operations.Bundle, deps TonDeps, in DeployOnRampInput) (DeployOnRampOutput, error) {
	output := DeployOnRampOutput{}

	// TODO wrap the code cell creation somewhere
	CounterContractPath := utils.GetBuildDir("OnRamp.compiled.json")
	codeCell, err := wrappers.ParseCompiledContract(CounterContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	storage := onramp.Storage{
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		ChainSelector: in.ChainSelector,
		Config: onramp.DynamicConfig{
			FeeQuoter:      in.FeeQuoter,
			FeeAggregator:  in.FeeAggregator,
			AllowListAdmin: deps.TonChain.WalletAddress,
		},
		DestChainConfigs: nil,
	}
	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	contract, err := wrappers.Deploy(&conn, codeCell, initData, tlb.MustFromTON("1"))
	if err != nil {
		return output, fmt.Errorf("failed to deploy onramp contract: %w", err)
	}

	output.Address = contract.Address
	return output, nil
}

type UpdateOnRampDestChainConfigsInput struct {
	Updates map[uint64]v1_6.OnRampDestinationUpdate
}

type UpdateOnRampDestChainConfigsOutput struct {
}

var UpdateOnRampDestChainConfigsOp = operations.NewOperation(
	"update-onramp-dest-chain-configs",
	semver.MustParse("0.1.0"),
	"Updates onramp's destination chain configs",
	updateOnRampDestChainConfigs,
)

func updateOnRampDestChainConfigs(b operations.Bundle, deps TonDeps, in UpdateOnRampDestChainConfigsInput) ([][]byte, error) {
	address := deps.CCIPOnChainState.TonChains[deps.TonChain.Selector].CCIPAddress

	var configs []onramp.UpdateDestChainConfig

	for selector, update := range in.Updates {
		// TODO: TestRouter support
		router := deps.CCIPOnChainState.TonChains[deps.TonChain.Selector].Router
		configs = append(configs, onramp.UpdateDestChainConfig{
			DestinationChainSelector: selector,
			Router:                   &router,
			AllowListEnabled:         update.AllowListEnabled,
		})
	}

	input := onramp.UpdateDestChainConfigs{
		Updates: common.SnakeData[onramp.UpdateDestChainConfig](configs),
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}

	messages := []*tlb.InternalMessage{
		{
			Bounce: true,
			// Amount:      amount,
			// TODO: need to add more addresses to deployments state, CCIPAddress should be OnRamp
			DstAddr: &address,
			Body:    payload,
		},
	}
	return utils.Serialize(messages)
}

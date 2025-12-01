package operation

import (
	"fmt"
	"math/big"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/helpers"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/onramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployOnRampInput struct {
	ID                   uint32
	ChainSelector        uint64
	FeeQuoter            *address.Address
	FeeAggregator        *address.Address
	ContractPath         string
	ExecutorContractPath string
	Coins                string
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
	codeCell, err := wrappers.ParseCompiledContract(in.ContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}
	executorCode, err := wrappers.ParseCompiledContract(in.ExecutorContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile executor contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	storage := onramp.Storage{
		ID: in.ID,
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: address.NewAddressNone(),
		},
		ChainSelector: in.ChainSelector,
		Config: onramp.DynamicConfig{
			FeeQuoter:      in.FeeQuoter,
			FeeAggregator:  in.FeeAggregator,
			AllowListAdmin: deps.TonChain.WalletAddress,
		},
		DestChainConfigs: nil,
		Executor: onramp.ExecutorDeployment{
			DeployableCode: codeCell,
			ExecutorCode:   executorCode,
			CurrentID:      big.NewInt(0),
		},
	}
	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	contract, _, err := wrappers.Deploy(b.GetContext(), &conn, codeCell, initData, tlb.MustFromTON(in.Coins), nil)
	if err != nil {
		return output, fmt.Errorf("failed to deploy onramp contract: %w", err)
	}
	b.Logger.Infow("Deployed OnRamp", "addr", contract.Address)

	output.Address = contract.Address
	return output, nil
}

type OnRampDestinationUpdate struct {
	IsEnabled        bool // If false, disables the destination by setting router to 0x0.
	TestRouter       bool // Flag for safety only allow specifying either router or testRouter.
	AllowListEnabled bool
}

type UpdateOnRampDestChainConfigsInput struct {
	Updates map[uint64]OnRampDestinationUpdate
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
	addr := deps.CCIPOnChainState[deps.TonChain.Selector].OnRamp

	if len(in.Updates) == 0 {
		b.Logger.Info("Skipping onramp.updateOnRampDestChainConfigs, no updates")
		// Nothing to update
		return nil, nil
	}

	configs := make([]onramp.UpdateDestChainConfig, 0, len(in.Updates))

	for selector, update := range in.Updates {
		// TODO: TestRouter support
		router := deps.CCIPOnChainState[deps.TonChain.Selector].Router
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
			Bounce:  true,
			Amount:  tlb.MustFromTON("0.1"),
			DstAddr: &addr,
			Body:    payload,
		},
	}
	return helpers.Serialize(messages)
}

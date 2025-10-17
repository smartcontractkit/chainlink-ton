package operation

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/receiver"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployReceiverInput struct {
	ID             uint32
	ContractPath   string
	OffRampAddress *address.Address
	Coins          string
}

type DeployReceiverOutput struct {
	Address *address.Address
}

var DeployReceiverOp = operations.NewOperation(
	"deploy-receiver-op",
	semver.MustParse("0.1.0"),
	"Deploys the Receiver contract",
	deployReceiver,
)

func deployReceiver(b operations.Bundle, deps TonDeps, in DeployReceiverInput) (DeployReceiverOutput, error) {
	output := DeployReceiverOutput{}

	codeCell, err := wrappers.ParseCompiledContract(in.ContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	storage := receiver.Storage{
		ID:        in.ID,
		OffRamp:   in.OffRampAddress,
		RejectAll: false,
	}

	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	contract, _, err := wrappers.Deploy(
		&conn,
		codeCell,
		initData,
		tlb.MustFromTON(in.Coins),
		nil,
	)
	if err != nil {
		return output, fmt.Errorf("failed to deploy receiver contract: %w", err)
	}
	b.Logger.Infow("Deployed Receiver", "addr", contract.Address, "deployer wallet addr", deps.TonChain.WalletAddress.String())

	output.Address = contract.Address
	return output, nil
}

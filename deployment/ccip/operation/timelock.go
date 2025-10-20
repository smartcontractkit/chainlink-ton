package operation

import (
	"fmt"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/lib/access/rbac"
	"github.com/smartcontractkit/chainlink-ton/pkg/bindings/mcms/timelock"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/xssnick/tonutils-go/tvm/cell"
	"math/big"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployTimelockInput struct {
	ID           uint32
	ContractPath string
	Coins        string
	MinDelay     uint64
	Admin        *address.Address
	Proposers    []*address.Address
	Executors    []*address.Address
	Cancellers   []*address.Address
	Bypassers    []*address.Address
}

type DeployTimelockOutput struct {
	Address *address.Address
}

var DeployTimelockOp = operations.NewOperation(
	"deploy-timelock-op",
	semver.MustParse("0.1.0"),
	"Deploys and initialize the Timelock contract",
	deployTimelock,
)

func deployTimelock(b operations.Bundle, deps TonDeps, in DeployTimelockInput) (DeployTimelockOutput, error) {
	output := DeployTimelockOutput{}

	codeCell, err := wrappers.ParseCompiledContract(in.ContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	storage := timelock.Data{
		ID:                       in.ID,
		MinDelay:                 in.MinDelay,
		Timestamps:               cell.NewDict(256),
		BlockedFnSelectorsLen:    0,
		BlockedFnSelectors:       cell.NewDict(32),
		ExecutorRoleCheckEnabled: true,
		OpPendingInfo: timelock.OpPendingInfo{
			ValidAfter:            0,
			OpFinalizationTimeout: 0,
			OpPendingID:           big.NewInt(0),
		},
		RBAC: rbac.Data{
			Roles: cell.NewDict(256),
		},
	}

	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	// When deploying the contract, send the Init message to initialize the Timelock contract
	body := timelock.Init{
		QueryID:                  0,
		MinDelay:                 in.MinDelay,
		Admin:                    in.Admin,
		Proposers:                common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.Proposers)),
		Executors:                common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.Executors)),
		Cancellers:               common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.Cancellers)),
		Bypassers:                common.SnakeRef[common.WrappedAddress](common.WrapAddresses(in.Bypassers)),
		ExecutorRoleCheckEnabled: true,
		OpFinalizationTimeout:    0,
	}

	b.Logger.Infow("Initializing Timelock", "init", body)

	bodyCell, err := tlb.ToCell(body)
	if err != nil {
		return output, fmt.Errorf("failed to pack body: %w", err)
	}

	contract, _, err := wrappers.Deploy(
		&conn,
		codeCell,
		initData,
		tlb.MustFromTON(in.Coins),
		bodyCell,
	)
	if err != nil {
		return output, fmt.Errorf("failed to deploy timelock contract: %w", err)
	}
	b.Logger.Infow("Deployed Timelock", "addr", contract.Address, "deployer wallet addr", deps.TonChain.WalletAddress.String())

	output.Address = contract.Address
	return output, nil
}

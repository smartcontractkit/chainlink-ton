package operation

import (
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/Masterminds/semver/v3"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"

	cldf_ton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	cldf_ops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployContractInput struct {
	Name         string
	Storage      any
	MessageBody  any
	ContractCode *cell.Cell
	Coins        string
}

type DeployContractOutput struct {
	Address *address.Address
}

var DeployTONContractOp = cldf_ops.NewOperation(
	"ton/ops/deploy",
	semver.MustParse("0.1.0"),
	"Deploys a TON contract in a generic way",
	deployTONContract,
)

func (i *DeployContractInput) Validate() error {
	if strings.TrimSpace(i.Name) == "" {
		return errors.New("name field is required")
	}
	if i.ContractCode == nil {
		return errors.New("contract code field is required")
	}
	if i.Storage == nil {
		return errors.New("storage field is required")
	}
	if _, ok := new(big.Rat).SetString(i.Coins); !ok {
		return fmt.Errorf("invalid TON amount %s", i.Coins)
	}

	return nil
}

func deployTONContract(b cldf_ops.Bundle, dp *dep.DependencyProvider, in DeployContractInput) (DeployContractOutput, error) {
	output := DeployContractOutput{}

	if err := in.Validate(); err != nil {
		return output, err
	}

	b.Logger.Infow("Deploy contract with generic deploy operation", "contract name", in.Name)

	chain, err := dep.Resolve[cldf_ton.Chain](dp)
	if err != nil {
		return output, fmt.Errorf("failed to resolve chain: %w", err)
	}
	conn := tracetracking.NewSignedAPIClient(chain.Client, *chain.Wallet)

	initData, err := tlb.ToCell(in.Storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}
	b.Logger.Infow("Setting initial storage for contract", "contract name", in.Name, "storage data hash", hex.EncodeToString(initData.Hash()), "storage bits size", initData.BitsSize())

	bodyCell := tvm.EmptyCell

	if in.MessageBody != nil {
		bodyCell, err = tlb.ToCell(in.MessageBody)
		if err != nil {
			return output, fmt.Errorf("failed to pack message body: %w", err)
		}
	}

	b.Logger.Infow("Initializing contract with body", "contract name", in.Name, "body data hash", hex.EncodeToString(bodyCell.Hash()), "body bits size", bodyCell.BitsSize())

	contract, _, err := wrappers.Deploy(
		b.GetContext(),
		&conn,
		in.ContractCode,
		initData,
		tlb.MustFromTON(in.Coins),
		bodyCell,
	)
	if err != nil {
		return output, fmt.Errorf("failed to deploy contract: %w", err)
	}
	b.Logger.Infow("Contract deployed", "contract name", in.Name, "addr", contract.Address, "deployer wallet addr", chain.WalletAddress.String())

	output.Address = contract.Address
	return output, nil
}

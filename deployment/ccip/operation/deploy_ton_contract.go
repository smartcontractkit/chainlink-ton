package operation

import (
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/Masterminds/semver/v3"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
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

var DeployTONContractOp = operations.NewOperation(
	"deploy-ton-contract-op",
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

func deployTONContract(b operations.Bundle, deps TonDeps, in DeployContractInput) (DeployContractOutput, error) {
	output := DeployContractOutput{}

	if err := in.Validate(); err != nil {
		return output, err
	}

	b.Logger.Infow("Deploy contract with generic deploy operation", "contract name", in.Name)

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	initData, err := tlb.ToCell(in.Storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}
	b.Logger.Infow("Setting initial storage for contract", "contract name", in.Name, "storage data hash", hex.EncodeToString(initData.Hash()), "storage bits size", initData.BitsSize())

	bodyCell := cell.BeginCell().EndCell()

	if in.MessageBody != nil {
		bodyCell, err = tlb.ToCell(in.MessageBody)
		if err != nil {
			return output, fmt.Errorf("failed to pack message body: %w", err)
		}
	}

	b.Logger.Infow("Initializing contract with body", "contract name", in.Name, "body data hash", hex.EncodeToString(bodyCell.Hash()), "body bits size", bodyCell.BitsSize())

	contract, _, err := wrappers.Deploy(
		&conn,
		in.ContractCode,
		initData,
		tlb.MustFromTON(in.Coins),
		bodyCell,
	)
	if err != nil {
		return output, fmt.Errorf("failed to deploy contract: %w", err)
	}
	b.Logger.Infow("Contract deployed", "contract name", in.Name, "addr", contract.Address, "deployer wallet addr", deps.TonChain.WalletAddress.String())

	output.Address = contract.Address
	return output, nil
}

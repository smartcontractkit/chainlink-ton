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

	cldfton "github.com/smartcontractkit/chainlink-deployments-framework/chain/ton"
	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldfops "github.com/smartcontractkit/chainlink-deployments-framework/operations"

	"github.com/smartcontractkit/chainlink-ton/cciplib/ton/tvm"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/ops/ton"
	"github.com/smartcontractkit/chainlink-ton/deployment/state"
)

type DeployContractInput struct {
	Name         tvm.FullyQualifiedName
	Storage      any
	MessageBody  any
	ContractCode *cell.Cell
	Coins        string
}

type DeployContractOutput struct {
	Address *address.Address
}

var DeployTONContractOp = cldfops.NewOperation(
	"ton/ops/deploy",
	semver.MustParse("0.1.0"),
	"Deploys a TON contract in a generic way",
	deployTONContract,
)

func (i *DeployContractInput) Validate() error {
	if strings.TrimSpace(string(i.Name)) == "" {
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

// InvokeDeployContractOperation invokes the generic TON contract deployment operation.
// It always executes the deployment operation and returns an error if the deployment fails.
func InvokeDeployContractOperation(b cldfops.Bundle, dp *dep.DependencyProvider, chainSelector uint64, compiledContract ton.CompiledContract, storage any, messageBody any, coin string) (*ds.AddressRef, error) {
	deployContractInput := DeployContractInput{
		Name:         compiledContract.Metadata.ID,
		Storage:      storage,
		MessageBody:  messageBody,
		ContractCode: compiledContract.Code,
		Coins:        coin,
	}

	deployContractReport, err := cldfops.ExecuteOperation(b, DeployTONContractOp, dp, deployContractInput)
	if err != nil {
		return nil, err
	}

	// Convert to ContractType (short identifier eg FeeQuoter from link.chain.ccip.ton.FeeQuoter)
	// before creating a ds.AddressRef
	contractType, ok := state.LongToShortContractType[compiledContract.Metadata.ID]
	if !ok {
		return nil, fmt.Errorf("unknown contract fully qualified name %q: no datastore type mapping found", compiledContract.Metadata.ID)
	}

	contractAddress := *deployContractReport.Output.Address
	// TODO: Qualifier not used here (fix)
	return &ds.AddressRef{
		Address:       contractAddress.String(),
		ChainSelector: chainSelector,
		Type:          contractType,
		Version:       compiledContract.Version,
		Labels:        ds.NewLabelSet(fmt.Sprintf("package:%v", compiledContract.Metadata.Package)),
	}, nil
}

func deployTONContract(b cldfops.Bundle, dp *dep.DependencyProvider, in DeployContractInput) (DeployContractOutput, error) {
	ctx := b.GetContext()
	output := DeployContractOutput{}

	if err := in.Validate(); err != nil {
		return output, err
	}

	b.Logger.Infow("Deploy contract with generic deploy operation", "contract name", in.Name)

	chain, err := dep.Resolve[cldfton.Chain](dp)
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
		// Check if the message body is already a cell
		var ok bool
		bodyCell, ok = in.MessageBody.(*cell.Cell)
		if !ok {
			// If not, try to convert it to a cell using tlb
			bodyCell, err = tlb.ToCell(in.MessageBody)
			if err != nil {
				return output, fmt.Errorf("failed to pack message body: %w", err)
			}
		}
	}

	block, err := chain.Client.CurrentMasterchainInfo(ctx)
	if err != nil {
		return output, fmt.Errorf("failed to get masterchain info: %w", err)
	}

	balance, err := chain.Wallet.GetBalance(ctx, block)
	if err != nil {
		return output, fmt.Errorf("failed to get wallet balance: %w", err)
	}

	value, err := tlb.FromTON(in.Coins)
	if err != nil {
		return output, fmt.Errorf("failed to parse coin amount: %w", err)
	}

	// Check balance before deploying
	if balance.Compare(&value) < 0 {
		return output, fmt.Errorf("insufficient account balance to deploy: balance %s, required value %s", balance.String(), value.String())
	}

	b.Logger.Infow("Initializing contract with body", "contract name", in.Name, "body data hash", hex.EncodeToString(bodyCell.Hash()), "body bits size", bodyCell.BitsSize())

	contract, _, err := wrappers.Deploy(ctx, &conn, in.ContractCode, initData, value, bodyCell)
	if err != nil {
		return output, fmt.Errorf("failed to deploy contract: %w", err)
	}
	b.Logger.Infow("Contract deployed", "contract name", in.Name, "addr", contract.Address, "deployer wallet addr", chain.WalletAddress.String())

	output.Address = contract.Address
	return output, nil
}

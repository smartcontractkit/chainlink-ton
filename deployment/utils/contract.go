package utils //nolint:revive,nolintlint // TODO: update to meaningful package name

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/deployment/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/operation"
)

type CompiledContractData struct {
	Type               ds.ContractType
	Code               *cell.Cell
	ContractVersionSha string
	ContractPath       string
}

type TONContractAddress struct {
	TONAddress     address.Address
	CLDFAddressRef ds.AddressRef
}

// InvokeDeployContractOperation deploys a TON contract if it's not already deployed.
// It checks the current address, executes the deployment operation if needed,
// Returns an error if the deployment fails.
func InvokeDeployContractOperation(b operations.Bundle, deps config.TonDeps, chainSelector uint64, compiledContract CompiledContractData, storage any, messageBody any, coin string, semver *semver.Version) (*TONContractAddress, error) {
	deployContractInput := operation.DeployContractInput{
		Name:         compiledContract.Type.String(),
		Storage:      storage,
		MessageBody:  messageBody,
		ContractCode: compiledContract.Code,
		Coins:        coin,
	}

	deployContractReport, err := operations.ExecuteOperation(b, operation.DeployTONContractOp, config.TonDeps{TonChain: deps.TonChain}, deployContractInput)
	if err != nil {
		return nil, err
	}

	contractAddress := *deployContractReport.Output.Address
	tonContractAddress := &TONContractAddress{
		TONAddress: contractAddress,
		CLDFAddressRef: ds.AddressRef{
			Address:       contractAddress.String(),
			ChainSelector: chainSelector,
			Type:          compiledContract.Type,
			Version:       semver,
			Labels:        ds.NewLabelSet(fmt.Sprintf("sha:%v", compiledContract.ContractVersionSha)),
		},
	}

	return tonContractAddress, nil
}

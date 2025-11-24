package utils //nolint:revive,nolintlint // TODO: update to meaningful package name

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/operation"
)

type CompiledContractData struct {
	Type                           ds.ContractType
	Code                           *cell.Cell
	SuggestedTONCoinsForDeployment string
	ContractVersionSha             string
	ContractSemver                 *semver.Version
	ContractPath                   string
}

type TONContractAddress struct {
	TONAddress     address.Address
	CLDFAddressRef ds.AddressRef
}

// InvokeDeployContractOperation deploys a TON contract if it's not already deployed.
// It checks the current address, executes the deployment operation if needed,
// Returns an error if the deployment fails.
func InvokeDeployContractOperation(b operations.Bundle, deps operation.TonDeps, chainSelector uint64, currentAddress address.Address, compiledContract CompiledContractData, storage any, messageBody any) (*TONContractAddress, error) {
	if !currentAddress.IsAddrNone() {
		b.Logger.Infof("%s contract is already deployed at address: %s. Skipping...", compiledContract.Type, currentAddress.String())
		return nil, nil
	}

	deployContractInput := operation.DeployContractInput{
		Name:         compiledContract.Type.String(),
		Storage:      storage,
		MessageBody:  messageBody,
		ContractCode: compiledContract.Code,
		Coins:        compiledContract.SuggestedTONCoinsForDeployment,
	}

	deployContractReport, err := operations.ExecuteOperation(b, operation.DeployTONContractOp, deps, deployContractInput)
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
			Version:       compiledContract.ContractSemver,
			Labels:        ds.NewLabelSet(fmt.Sprintf("sha:%v", compiledContract.ContractVersionSha)),
		},
	}

	return tonContractAddress, nil
}

package utils //nolint:revive,nolintlint // TODO: update to meaningful package name

import (
	"fmt"

	"github.com/Masterminds/semver/v3"
	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/tvm/cell"

	"github.com/smartcontractkit/chainlink-ton/deployment/pkg/dep"
	"github.com/smartcontractkit/chainlink-ton/deployment/utils/operation"
)

type CompiledContractData struct {
	Type               ds.ContractType
	Code               *cell.Cell
	ContractVersionSha string
	ContractPath       string
}

// InvokeDeployContractOperation deploys a TON contract if it's not already deployed.
// It checks the current address, executes the deployment operation if needed,
// Returns an error if the deployment fails.
func InvokeDeployContractOperation(b operations.Bundle, dp *dep.DependencyProvider, chainSelector uint64, compiledContract CompiledContractData, storage any, messageBody any, coin string, semver *semver.Version) (*ds.AddressRef, error) {
	deployContractInput := operation.DeployContractInput{
		Name:         compiledContract.Type.String(),
		Storage:      storage,
		MessageBody:  messageBody,
		ContractCode: compiledContract.Code,
		Coins:        coin,
	}

	deployContractReport, err := operations.ExecuteOperation(b, operation.DeployTONContractOp, dp, deployContractInput)
	if err != nil {
		return nil, err
	}

	contractAddress := *deployContractReport.Output.Address
	// TODO: Qualifier not used here (fix)
	return &ds.AddressRef{
		Address:       contractAddress.String(),
		ChainSelector: chainSelector,
		Type:          compiledContract.Type, // TODO: type mismatch for MCMS deployment (updated upstream, needs fix here)
		Version:       semver,
		Labels:        ds.NewLabelSet(fmt.Sprintf("sha:%v", compiledContract.ContractVersionSha)),
	}, nil
}

// DataStoreToAddressBook is a temp function to transform a DataStore to the legacy AddressBook. Couldn't find any utility function to do this.
// Once we adopt this new change set in CLD we can remove returning AddressBook at all :)
func DataStoreToAddressBook(ds *ds.MemoryDataStore) (*cldf.AddressBookMap, error) {
	ab := cldf.NewMemoryAddressBook()
	addresses, err := ds.Addresses().Fetch()
	if err != nil {
		return nil, fmt.Errorf("failed to list addresses from datastore: %w", err)
	}
	for _, addrRef := range addresses {
		err := ab.Save(addrRef.ChainSelector, addrRef.Address, cldf.NewTypeAndVersion(cldf.ContractType(addrRef.Type), *addrRef.Version))
		if err != nil {
			return nil, fmt.Errorf("failed to save address %s to address book: %w", addrRef.Type, err)
		}
	}
	return ab, nil
}

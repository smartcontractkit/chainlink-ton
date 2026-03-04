package utils //nolint:revive,nolintlint // TODO: update to meaningful package name

import (
	"fmt"

	ds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	cldf "github.com/smartcontractkit/chainlink-deployments-framework/deployment"
)

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

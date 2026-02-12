package utils

import (
	"fmt"

	"github.com/smartcontractkit/chainlink-deployments-framework/datastore"
	"github.com/xssnick/tonutils-go/address"

	datastore_utils "github.com/smartcontractkit/chainlink-ccip/deployment/utils/datastore"
)

// ToTONAddress formats a datastore.AddressRef into a TON *address.Address.
func ToTONAddress(ref datastore.AddressRef) (*address.Address, error) {
	if ref.Address == "" {
		return nil, fmt.Errorf("address is empty in ref: %s,{ChainSelector: %d, Type: %s, Version: %s, Qualifier: %s, Address: %s}", datastore_utils.SprintRef(ref), ref.ChainSelector, ref.Type, ref.Version, ref.Qualifier, ref.Address)
	}
	addr, err := address.ParseAddr(ref.Address)
	if err != nil {
		return nil, fmt.Errorf("invalid TON address in ref %s: %w, {ChainSelector: %d, Type: %s, Version: %s, Qualifier: %s, Address: %s}", datastore_utils.SprintRef(ref), err, ref.ChainSelector, ref.Type, ref.Version, ref.Qualifier, ref.Address)
	}
	return addr, nil
}

package resolvers

import (
	"encoding/json"
	"errors"
	"fmt"

	cldfds "github.com/smartcontractkit/chainlink-deployments-framework/datastore"

	ccipdds "github.com/smartcontractkit/chainlink-ccip/deployment/utils/datastore"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec"

	"github.com/smartcontractkit/chainlink-ton/deployment/utils"
)

var (
	_ codec.Resolver[map[string]any, *address.Address] = (*tonAddrResolver)(nil)
	_ codec.ResolverKeyProvider                        = (*tonAddrResolver)(nil)
)

// tonAddrResolver resolves an AddressRef map data to *address.Address
type tonAddrResolver struct {
	// Loaded environment data is needed to resolve the address
	chainSelector uint64
	dataStore     cldfds.DataStore
}

func NewTonAddrResolver(chainSelector uint64, dataStore cldfds.DataStore) codec.Resolver[map[string]any, *address.Address] {
	return &tonAddrResolver{
		chainSelector: chainSelector,
		dataStore:     dataStore,
	}
}

func (r *tonAddrResolver) Key() string {
	return "codec.resolvers.address-ref-to-ton-addr"
}

// Decode map data to struct using loaded TLB registry
func (r *tonAddrResolver) Resolve(input map[string]any) (*address.Address, error) {
	if input == nil {
		return nil, errors.New("cannot resolve nil input")
	}

	data, ok := input["data"]
	if !ok {
		return nil, fmt.Errorf("missing 'data' field in input: %v", input)
	}

	// Return nil if data is explicitly nil
	if data == nil {
		return nil, nil
	}

	dataBytes, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal 'data' field: %w", err)
	}

	var q cldfds.AddressRef
	err = json.Unmarshal(dataBytes, &q)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal 'data' field to AddressRef: %w", err)
	}

	addr, err := ccipdds.FindAndFormatRef(r.dataStore, q, r.chainSelector, utils.ToTONAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve address for chain %d: %w", r.chainSelector, err)
	}

	return addr, nil
}

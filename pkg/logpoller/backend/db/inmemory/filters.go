package inmemory

import (
	"context"
	"fmt"
	"sync"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

var _ logpoller.FilterStore = (*inMemoryFilters)(nil)

// inMemoryFilters is an in-memory implementation of the Filters interface.
type inMemoryFilters struct {
	mu               sync.RWMutex
	filtersByName    map[string]types.Filter        // filtersByName maps a filter's unique name to its definition.
	filtersByAddress map[string]map[uint32]struct{} // filtersByAddress maps a contract address string to a set of its watched event signature.
}

// NewFilterStore creates a new in-memory implementation of the Filters interface.
// TODO(NONEVM-2187): implement ORM and remove in-memory store
func NewFilterStore() logpoller.FilterStore {
	return &inMemoryFilters{
		filtersByName:    make(map[string]types.Filter),
		filtersByAddress: make(map[string]map[uint32]struct{}),
	}
}

// RegisterFilter adds a filter to the in-memory store.
func (f *inMemoryFilters) RegisterFilter(_ context.Context, flt types.Filter) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	f.filtersByName[flt.Name] = flt

	a := flt.Address.String()
	if f.filtersByAddress[a] == nil {
		f.filtersByAddress[a] = make(map[uint32]struct{})
	}
	f.filtersByAddress[a][flt.EventSig] = struct{}{}

	return nil
}

// UnregisterFilter removes a filter from the in-memory store.
func (f *inMemoryFilters) UnregisterFilter(_ context.Context, name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	flt, ok := f.filtersByName[name]
	if !ok {
		return nil
	}

	delete(f.filtersByName, name)

	a := flt.Address.String()
	if bySig, exists := f.filtersByAddress[a]; exists {
		delete(bySig, flt.EventSig)
		if len(bySig) == 0 {
			delete(f.filtersByAddress, a)
		}
	}

	return nil
}

func (f *inMemoryFilters) HasFilter(_ context.Context, name string) (bool, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	_, exists := f.filtersByName[name]
	return exists, nil
}

// GetDistinctAddresses returns all unique contract addresses being tracked.
func (f *inMemoryFilters) GetDistinctAddresses() ([]*address.Address, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	out := make([]*address.Address, 0, len(f.filtersByAddress))
	for a := range f.filtersByAddress {
		addr, err := address.ParseAddr(a)
		if err != nil {
			return nil, fmt.Errorf("failed to parse address from %s: %w", a, err)
		}
		out = append(out, addr)
	}
	return out, nil
}

// GetFiltersForAddress returns all filters registered for a given address.
func (f *inMemoryFilters) GetFiltersForAddress(_ context.Context, addr *address.Address) ([]types.Filter, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	var out []types.Filter
	for _, flt := range f.filtersByName {
		if flt.Address.Equals(addr) {
			out = append(out, flt)
		}
	}
	return out, nil
}

// GetFiltersForAddressAndMsgType returns filters for a specific address and message type.
func (f *inMemoryFilters) GetFiltersForAddressAndMsgType(_ context.Context, addr *address.Address, msgType tlb.MsgType) ([]types.Filter, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	var out []types.Filter
	for _, flt := range f.filtersByName {
		if flt.Address.Equals(addr) && flt.MsgType == msgType {
			out = append(out, flt)
		}
	}
	return out, nil
}

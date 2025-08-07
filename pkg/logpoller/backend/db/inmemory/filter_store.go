package inmemory

import (
	"context"
	"fmt"
	"sync"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

// inMemoryFilters is an in-memory implementation of the Filters interface.
type inMemoryFilters struct {
	mu               sync.RWMutex
	filtersByName    map[string]types.Filter        // filtersByName maps a filter's unique name to its definition.
	filtersByAddress map[string]map[uint32]struct{} // filtersByAddress maps a contract address string to a set of its watched event topics.
}

var _ logpoller.FilterStore = (*inMemoryFilters)(nil)

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
	f.filtersByAddress[a][flt.EventTopic] = struct{}{}

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
	if byTopic, exists := f.filtersByAddress[a]; exists {
		delete(byTopic, flt.EventTopic)
		if len(byTopic) == 0 {
			delete(f.filtersByAddress, a)
		}
	}

	return nil
}

func (f *inMemoryFilters) HasFilter(_ context.Context, name string) bool {
	f.mu.RLock()
	defer f.mu.RUnlock()
	_, exists := f.filtersByName[name]
	return exists
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

// MatchingFilters finds all filter IDs that correspond to a given address and topic.
func (f *inMemoryFilters) MatchingFilters(contractAddr address.Address, topic uint32) []int64 {
	f.mu.RLock()
	defer f.mu.RUnlock()

	byTopic, ok := f.filtersByAddress[contractAddr.String()]
	if !ok {
		return nil
	}
	if _, watched := byTopic[topic]; !watched {
		return nil
	}

	var out []int64
	for _, flt := range f.filtersByName {
		if flt.Address.Equals(&contractAddr) && flt.EventTopic == topic {
			out = append(out, flt.ID)
		}
	}
	return out
}

package inmemory

import (
	"context"
	"fmt"
	"sync"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"
	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller"
	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

var _ logpoller.FilterStore = (*inMemoryFilters)(nil)

// inMemoryFilters is an in-memory implementation of the Filters interface.
type inMemoryFilters struct {
	chainID          string
	lggr             logger.Logger
	mu               sync.RWMutex
	filtersByName    map[string]models.Filter       // filtersByName maps a filter's unique name to its definition.
	filtersByAddress map[string]map[uint32]struct{} // filtersByAddress maps a contract address string to a set of its watched event signature.
}

// NewFilterStore creates a new in-memory implementation of the Filters interface.
func NewFilterStore(chainID string, lggr logger.Logger) logpoller.FilterStore {
	return &inMemoryFilters{
		chainID:          chainID,
		lggr:             lggr,
		filtersByName:    make(map[string]models.Filter),
		filtersByAddress: make(map[string]map[uint32]struct{}),
	}
}

// RegisterFilter adds a filter to the in-memory store.
func (f *inMemoryFilters) RegisterFilter(_ context.Context, flt models.Filter) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	// Generate ID for the filter
	id := int64(len(f.filtersByName) + 1) // Start from 1
	flt.ID = id

	f.filtersByName[flt.Name] = flt

	a := flt.Address.String()
	if f.filtersByAddress[a] == nil {
		f.filtersByAddress[a] = make(map[uint32]struct{})
	}
	f.filtersByAddress[a][flt.EventSig] = struct{}{}

	return id, nil
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
func (f *inMemoryFilters) GetDistinctAddresses(_ context.Context) ([]*address.Address, error) {
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
func (f *inMemoryFilters) GetFiltersByAddress(_ context.Context, addr *address.Address) ([]models.Filter, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	var out []models.Filter
	for _, flt := range f.filtersByName {
		if flt.Address.Equals(addr) {
			out = append(out, flt)
		}
	}
	return out, nil
}

// DeleteEmptyFilters is a no-op for the in-memory store.
// In-memory store is for testing basic filter storage; pruning should be tested via PostgreSQL integration tests.
func (f *inMemoryFilters) DeleteEmptyFilters(_ context.Context) (int64, error) {
	return 0, nil
}

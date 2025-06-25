package logpoller

import (
	"context"
	"sync"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/types"
)

type Filters struct {
	mu               sync.RWMutex
	filtersByName    map[string]types.Filter
	filtersByAddress map[string]map[uint64]struct{}
}

func newFilters() *Filters {
	return &Filters{
		filtersByName:    make(map[string]types.Filter),
		filtersByAddress: make(map[string]map[uint64]struct{}),
	}
}

func (f *Filters) RegisterFilter(ctx context.Context, flt types.Filter) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.filtersByName[flt.Name] = flt
	a := flt.Address.String()
	if f.filtersByAddress[a] == nil {
		f.filtersByAddress[a] = make(map[uint64]struct{})
	}
	f.filtersByAddress[a][flt.EventTopic] = struct{}{}
}

func (f *Filters) UnregisterFilter(ctx context.Context, name string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	flt, ok := f.filtersByName[name]
	if !ok {
		return
	}
	delete(f.filtersByName, name)
	a := flt.Address.String()
	delete(f.filtersByAddress[a], flt.EventTopic)
	if len(f.filtersByAddress[a]) == 0 {
		delete(f.filtersByAddress, a)
	}
}

func (f *Filters) GetDistinctAddresses() []*address.Address {
	f.mu.RLock()
	defer f.mu.RUnlock()
	out := make([]*address.Address, 0, len(f.filtersByAddress))
	for a := range f.filtersByAddress {
		addr := address.MustParseAddr(a)
		out = append(out, addr)
	}
	return out
}

// For a given (contractAddr, topic), return all FilterIDs that match.
func (f *Filters) MatchingFilters(contractAddr address.Address, topic uint64) []int64 {
	f.mu.RLock()
	defer f.mu.RUnlock()
	var out []int64
	byTopic, ok := f.filtersByAddress[contractAddr.String()]
	if !ok {
		return nil
	}
	if _, watched := byTopic[topic]; !watched {
		return nil
	}
	// collect all IDs whose Filter.Address/topic match
	for _, flt := range f.filtersByName {
		if flt.Address.Equals(&contractAddr) && flt.EventTopic == topic {
			out = append(out, flt.ID)
		}
	}
	return out
}

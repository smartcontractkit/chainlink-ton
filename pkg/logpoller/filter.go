package logpoller

import (
	"context"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// buildFilterIndex builds FilterIndex from the in-memory filtersByName cache.
// Returns FilterIndex mapping filter keys to Filter objects for direct property access.
// Note: returned Filter pointers reference cached data - callers must not mutate them.
func (lp *service) buildFilterIndex(ctx context.Context) (models.FilterIndex, error) {
	if err := lp.loadFilters(ctx); err != nil {
		return nil, err
	}

	lp.filtersMu.RLock()
	defer lp.filtersMu.RUnlock()

	filterIndex := make(models.FilterIndex)
	for _, filter := range lp.filtersByName {
		key := models.FilterKey{
			Address:  filter.Address,
			MsgType:  filter.MsgType,
			EventSig: filter.EventSig,
		}
		keyStr := key.String()
		filterIndex[keyStr] = append(filterIndex[keyStr], filter)
	}

	return filterIndex, nil
}

// getDistinctAddresses returns unique addresses from the in-memory filtersByName cache.
func (lp *service) getDistinctAddresses(ctx context.Context) ([]*address.Address, error) {
	if err := lp.loadFilters(ctx); err != nil {
		return nil, err
	}

	lp.filtersMu.RLock()
	defer lp.filtersMu.RUnlock()

	addressSet := make(map[string]*address.Address)
	for _, filter := range lp.filtersByName {
		addrStr := filter.Address.String()
		if _, ok := addressSet[addrStr]; !ok {
			addressSet[addrStr] = filter.Address
		}
	}

	addresses := make([]*address.Address, 0, len(addressSet))
	for _, addr := range addressSet {
		addresses = append(addresses, addr)
	}

	return addresses, nil
}

// RegisterFilter registers a filter for log polling.
// Checks cache first - skips DB if filter already exists with same config.
//
// Note: Filter changes take effect on the next LogPoller loop tick (up to pollPeriod delay).
// If registration occurs before run() reads addresses, the change applies immediately.
// Otherwise, it waits until the next tick.
func (lp *service) RegisterFilter(ctx context.Context, filter models.Filter) (int64, error) {
	// Ensure cache is loaded
	if err := lp.loadFilters(ctx); err != nil {
		return 0, err
	}

	// Check cache first (read lock)
	lp.filtersMu.RLock()
	if cached, ok := lp.filtersByName[filter.Name]; ok {
		// Filter exists - check if config matches
		if cached.Address.String() == filter.Address.String() &&
			cached.MsgType == filter.MsgType &&
			cached.EventSig == filter.EventSig {
			// Same config - return cached ID, skip DB
			id := cached.ID
			lp.filtersMu.RUnlock()
			return id, nil
		}
	}
	lp.filtersMu.RUnlock()

	// Cache miss or config changed - hit DB
	id, err := lp.filterStore.RegisterFilter(ctx, filter)
	if err != nil {
		return 0, err
	}

	// Update cache (write lock)
	lp.filtersMu.Lock()
	filter.ID = id
	lp.filtersByName[filter.Name] = &filter
	lp.filtersMu.Unlock()

	return id, nil
}

// UnregisterFilter marks a filter as deleted.
//
// Note: Filter removal takes effect on the next LogPoller loop tick (up to pollPeriod delay).
// If unregistration occurs during an active tick, the old filter continues processing for that tick.
func (lp *service) UnregisterFilter(ctx context.Context, name string) error {
	// Hit DB first (marks is_deleted = true)
	if err := lp.filterStore.UnregisterFilter(ctx, name); err != nil {
		return err
	}

	// Update cache
	lp.filtersMu.Lock()
	delete(lp.filtersByName, name)
	lp.filtersMu.Unlock()

	return nil
}

// HasFilter checks if a filter with the given name exists.
// Uses in-memory cache - no database query.
func (lp *service) HasFilter(ctx context.Context, name string) (bool, error) {
	if err := lp.loadFilters(ctx); err != nil {
		return false, err
	}

	lp.filtersMu.RLock()
	_, exists := lp.filtersByName[name]
	lp.filtersMu.RUnlock()

	return exists, nil
}

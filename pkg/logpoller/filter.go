package logpoller

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// buildFilterIndex creates a filter index for efficient lookup during processing.
// Returns FilterIndex mapping filter keys to Filter objects, enabling direct property access.
func (lp *service) buildFilterIndex(ctx context.Context, addresses []*address.Address) (models.FilterIndex, error) {
	filterIndex := make(models.FilterIndex)

	for _, addr := range addresses {
		filters, err := lp.filterStore.GetFiltersByAddress(ctx, addr)
		if err != nil {
			return nil, fmt.Errorf("failed to get filters for %s: %w", addr.String(), err)
		}

		for _, filter := range filters {
			key := models.FilterKey{
				Address:  addr,
				MsgType:  filter.MsgType,
				EventSig: filter.EventSig,
			}
			keyStr := key.String()
			filterIndex[keyStr] = append(filterIndex[keyStr], &filter)
		}
	}

	return filterIndex, nil
}

// RegisterFilter adds a new filter to monitor specific address/event signature combinations.
// Note: Filter changes take effect on the next LogPoller loop tick (up to pollPeriod delay)
// If registration occurs before run() reads addresses, the change applies immediately.
// Otherwise, it waits until the next tick.
func (lp *service) RegisterFilter(ctx context.Context, flt models.Filter) (int64, error) {
	id, err := lp.filterStore.RegisterFilter(ctx, flt)
	if err != nil {
		return 0, err
	}

	return id, nil
}

// UnregisterFilter removes a filter by name.
// Note: Filter removal takes effect on the next LogPoller loop tick (up to pollPeriod delay)
// If unregistration occurs during an active tick, the old filter continues processing for that tick.
func (lp *service) UnregisterFilter(ctx context.Context, name string) error {
	return lp.filterStore.UnregisterFilter(ctx, name)
}

// HasFilter checks if a filter with the given name exists
func (lp *service) HasFilter(ctx context.Context, name string) (bool, error) {
	return lp.filterStore.HasFilter(ctx, name)
}

package logpoller

import (
	"context"
	"fmt"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// BuildFilterIndex creates a filter index for efficient lookup during processing.
// This function consolidates filter queries and builds an in-memory index to avoid
// repeated database calls during transaction processing.
func (lp *service) buildFilterIndex(ctx context.Context, addresses []*address.Address) (models.FilterIndex, error) {
	filterIndex := make(models.FilterIndex)
	for _, addr := range addresses {
		// Get all filters for this address
		filters, err := lp.filterStore.GetFiltersByAddress(ctx, addr)
		if err != nil {
			return nil, fmt.Errorf("failed to get filters for %s: %w", addr.String(), err)
		}

		// index filters by (address, msgType, eventSig) using string representation
		for _, filter := range filters {
			key := models.FilterKey{
				Address:  addr,
				MsgType:  filter.MsgType,
				EventSig: filter.EventSig,
			}
			keyStr := key.String()
			filterIndex[keyStr] = append(filterIndex[keyStr], filter.ID)
		}
	}

	return filterIndex, nil
}

// RegisterFilter adds a new filter to monitor specific address/event signature combinations
func (lp *service) RegisterFilter(ctx context.Context, flt models.Filter) (int64, error) {
	id, err := lp.filterStore.RegisterFilter(ctx, flt)
	if err != nil {
		return 0, err
	}

	return id, nil
}

// UnregisterFilter removes a filter by name
func (lp *service) UnregisterFilter(ctx context.Context, name string) error {
	return lp.filterStore.UnregisterFilter(ctx, name)
}

// HasFilter checks if a filter with the given name exists
func (lp *service) HasFilter(ctx context.Context, name string) (bool, error) {
	return lp.filterStore.HasFilter(ctx, name)
}
